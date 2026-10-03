import { beforeEach, describe, expect, it } from 'vitest';
import { toLocalDate } from './dates';
import { computeBalances } from './balances';
import { deriveObligationEvents } from './obligations';
import { computeOverdue, computePayoutStatus } from './payout';
import type { LedgerSnapshot } from './records';
import { adjustment, d, income, m, payment, resetFixtureSequence, snapshot } from './testFixtures';

const trackingStart = toLocalDate('2026-10-03');
const PAYOUT = '2026-12-31';

beforeEach(() => resetFixtureSequence());

function status(snap: LedgerSnapshot, today: string, plannedDate = PAYOUT, isDefaultDate = true) {
  const events = deriveObligationEvents(snap);
  const balances = computeBalances(snap, trackingStart, events);
  return computePayoutStatus({ today: d(today), plannedDate: d(plannedDate), isDefaultDate, balances, events });
}

const oneIncome = (): LedgerSnapshot => snapshot({ incomes: [income({ amount: '1,000.00', on: '2026-11-01', id: 'inc-1' })] });

describe('countdown', () => {
  it('2026-10-03 -> 2026-12-31 is 89 days', () => {
    const s = status(oneIncome(), '2026-10-03');
    expect(s).toMatchObject({
      phase: 'upcoming',
      plannedDate: PAYOUT,
      targetDate: PAYOUT,
      isDefaultDate: true,
      daysUntil: 89,
      daysOverdue: null,
      label: '89 days until payout',
    });
    expect(s.perCurrency.find((c) => c.currency === 'CAD')).toEqual({ currency: 'CAD', dueMinor: m('100.00'), overdueMinor: 0 });
  });

  it('uses the singular for one day', () => {
    expect(status(oneIncome(), '2026-12-30').label).toBe('1 day until payout');
  });

  it('shows Due today on the payout date', () => {
    const s = status(oneIncome(), '2026-12-31');
    expect(s).toMatchObject({ phase: 'due_today', daysUntil: null, label: 'Due today' });
    expect(s.perCurrency[0]?.dueMinor).toBe(m('100.00'));
  });

  it('keeps a user-set date flag', () => {
    expect(status(oneIncome(), '2026-10-03', '2026-11-15', false)).toMatchObject({ isDefaultDate: false, daysUntil: 43 });
  });
});

describe('overdue', () => {
  it('is overdue after the payout date with the unpaid amount', () => {
    const s = status(oneIncome(), '2027-01-03');
    expect(s).toMatchObject({ phase: 'overdue', daysOverdue: 3, daysUntil: null, label: 'Overdue by 3 days' });
    expect(s.perCurrency.find((c) => c.currency === 'CAD')?.overdueMinor).toBe(m('100.00'));
    expect(status(oneIncome(), '2027-01-01').label).toBe('Overdue by 1 day');
  });

  it('counts only obligations dated on or before the payout date', () => {
    const snap = snapshot({
      incomes: [income({ amount: '1,000.00', on: '2026-11-01' }), income({ amount: '500.00', on: '2027-01-02' })],
    });
    const s = status(snap, '2027-01-03');
    expect(s.perCurrency[0]).toEqual({ currency: 'CAD', dueMinor: m('150.00'), overdueMinor: m('100.00') });
  });

  it('counts only the part of a bucket dated on or before an earlier payout date', () => {
    const snap = snapshot({
      incomes: [income({ amount: '1,000.00', on: '2026-11-01' }), income({ amount: '500.00', on: '2026-12-20' })],
    });
    const s = status(snap, '2026-12-16', '2026-12-15');
    expect(s.perCurrency[0]).toEqual({ currency: 'CAD', dueMinor: m('150.00'), overdueMinor: m('100.00') });
  });

  it('reduces overdue by allocations and applied credit', () => {
    const snap = snapshot({
      incomes: [income({ amount: '1,000.00', on: '2026-11-01' })],
      payments: [payment({ amount: '70.00', on: '2026-12-01', allocations: [[2026, '60.00']] })],
    });
    expect(status(snap, '2027-01-03').perCurrency[0]?.overdueMinor).toBe(m('30.00'));
  });

  it('reports overdue per currency', () => {
    const snap = snapshot({
      incomes: [
        income({ amount: '1,000.00', on: '2026-11-01', currency: 'CAD' }),
        income({ amount: '200.00', on: '2026-11-01', currency: 'USD' }),
      ],
      payments: [payment({ amount: '100.00', on: '2026-12-01', allocations: [[2026, '100.00']] })],
    });
    const s = status(snap, '2027-01-03');
    expect(s.phase).toBe('overdue');
    expect(s.perCurrency).toEqual([
      { currency: 'CAD', dueMinor: 0, overdueMinor: 0 },
      { currency: 'USD', dueMinor: m('20.00'), overdueMinor: m('20.00') },
    ]);
  });
});

describe('refunds after the payout date never create phantom overdue', () => {
  it('a full refund dated next year leaves nothing overdue', () => {
    const snap = snapshot({
      incomes: [income({ amount: '1,000.00', on: '2026-11-01', id: 'inc-1' })],
      adjustments: [adjustment({ incomeId: 'inc-1', amount: '1,000.00', on: '2027-01-02' })],
    });
    const s = status(snap, '2027-01-05');
    expect(s.phase).toBe('settled_rolled');
    expect(s.perCurrency[0]).toEqual({ currency: 'CAD', dueMinor: 0, overdueMinor: 0 });
  });

  it('a partial refund dated next year turns into credit that covers the old bucket', () => {
    const snap = snapshot({
      incomes: [income({ amount: '1,000.00', on: '2026-11-01', id: 'inc-1' })],
      adjustments: [adjustment({ incomeId: 'inc-1', amount: '400.00', on: '2027-01-02' })],
      payments: [payment({ amount: '60.00', on: '2026-12-01', allocations: [[2026, '60.00']] })],
    });
    const s = status(snap, '2027-01-05');
    expect(s.perCurrency[0]).toEqual({ currency: 'CAD', dueMinor: 0, overdueMinor: 0 });
  });

  it('a refund in the same bucket after an earlier payout date reduces overdue', () => {
    const snap = snapshot({
      incomes: [income({ amount: '1,000.00', on: '2026-11-01', id: 'inc-1' })],
      adjustments: [adjustment({ incomeId: 'inc-1', amount: '1,000.00', on: '2026-12-20' })],
    });
    const events = deriveObligationEvents(snap);
    const cad = computeBalances(snap, trackingStart, events).CAD;
    expect(computeOverdue(cad, events, d('2026-12-15'))).toBe(0);
  });
});

describe('settled and rolled over', () => {
  it('rolls to Dec 31 of the current year when nothing is overdue', () => {
    const snap = snapshot({
      incomes: [income({ amount: '1,000.00', on: '2026-11-01' })],
      payments: [payment({ amount: '100.00', on: '2026-12-20', allocations: [[2026, '100.00']] })],
    });
    const s = status(snap, '2027-01-05', PAYOUT, false);
    expect(s).toMatchObject({
      phase: 'settled_rolled',
      plannedDate: PAYOUT,
      targetDate: '2027-12-31',
      isDefaultDate: true,
      daysUntil: 360,
      daysOverdue: null,
      label: '360 days until payout',
    });
  });

  it('rolls with an empty ledger too', () => {
    expect(status(snapshot(), '2027-01-01').phase).toBe('settled_rolled');
  });

  it('shows Due today when the rolled target is today', () => {
    const s = status(snapshot(), '2026-12-31', '2026-06-30');
    expect(s).toMatchObject({ phase: 'due_today', targetDate: '2026-12-31', isDefaultDate: true });
  });
});
