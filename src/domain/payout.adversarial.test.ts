/**
 * Adversarial tests for the payout schedule (ARCHITECTURE §3.8): the phase on every boundary day,
 * leap days, rollover, time zones feeding "today", and invariants over random ledgers.
 */
import fc from 'fast-check';
import { beforeEach, describe, expect, it } from 'vitest';
import { computeBalances } from './balances';
import { addDays, daysBetween, endOfYear, fromEpochDay, toEpochDay, todayInZone, yearOf, type LocalDate } from './dates';
import { deriveObligationEvents } from './obligations';
import { computeOverdue, computePayoutStatus, type PayoutStatus } from './payout';
import type { LedgerSnapshot } from './records';
import { adjustment, d, income, m, opening, payment, resetFixtureSequence, snapshot } from './testFixtures';

beforeEach(() => resetFixtureSequence());

const trackingStart = d('2026-10-03');

function status(snap: LedgerSnapshot, today: LocalDate, plannedDate: LocalDate, isDefaultDate = false): PayoutStatus {
  const events = deriveObligationEvents(snap);
  const balances = computeBalances(snap, trackingStart, events);
  return computePayoutStatus({ today, plannedDate, isDefaultDate, balances, events });
}

const unpaid = (): LedgerSnapshot => snapshot({ incomes: [income({ amount: '1,000.00', on: '2026-10-05' })] });
const settled = (): LedgerSnapshot =>
  snapshot({
    incomes: [income({ amount: '1,000.00', on: '2026-10-05' })],
    payments: [payment({ amount: '100.00', on: '2026-10-06', allocations: [[2026, '100.00']] })],
  });

describe('every boundary day around the planned date', () => {
  it.each<[string, number, Partial<PayoutStatus>]>([
    ['unpaid', -2, { phase: 'upcoming', daysUntil: 2, daysOverdue: null, label: '2 days until payout' }],
    ['unpaid', -1, { phase: 'upcoming', daysUntil: 1, daysOverdue: null, label: '1 day until payout' }],
    ['unpaid', 0, { phase: 'due_today', daysUntil: null, daysOverdue: null, label: 'Due today' }],
    ['unpaid', 1, { phase: 'overdue', daysUntil: null, daysOverdue: 1, label: 'Overdue by 1 day' }],
    ['unpaid', 2, { phase: 'overdue', daysUntil: null, daysOverdue: 2, label: 'Overdue by 2 days' }],
    ['settled', -1, { phase: 'upcoming', daysUntil: 1 }],
    ['settled', 0, { phase: 'due_today' }],
    ['settled', 1, { phase: 'settled_rolled', targetDate: '2026-12-31' as LocalDate, daysUntil: 45, isDefaultDate: true }],
  ])('%s ledger, planned 2026-11-15, today %+i days', (ledger, offset, expected) => {
    const planned = d('2026-11-15');
    const snap = ledger === 'unpaid' ? unpaid() : settled();
    expect(status(snap, addDays(planned, offset), planned)).toMatchObject({ plannedDate: planned, ...expected });
  });

  it('counts across a leap day and a year boundary in calendar days', () => {
    expect(status(unpaid(), d('2028-03-01'), d('2028-02-28'))).toMatchObject({ phase: 'overdue', daysOverdue: 2 });
    expect(status(unpaid(), d('2028-02-28'), d('2028-03-01'))).toMatchObject({ phase: 'upcoming', daysUntil: 2 });
    expect(status(unpaid(), d('2026-12-31'), d('2027-01-01'))).toMatchObject({ phase: 'upcoming', daysUntil: 1 });
  });

  it('rolls to Dec 31 of the current year on Jan 1 and Dec 30, and is Due today on Dec 31', () => {
    expect(status(settled(), d('2027-01-01'), d('2026-12-31'))).toMatchObject({ phase: 'settled_rolled', targetDate: '2027-12-31', daysUntil: 364 });
    expect(status(settled(), d('2028-01-01'), d('2026-12-31'))).toMatchObject({ phase: 'settled_rolled', targetDate: '2028-12-31', daysUntil: 365 });
    expect(status(settled(), d('2027-12-30'), d('2026-12-31'))).toMatchObject({ phase: 'settled_rolled', daysUntil: 1, label: '1 day until payout' });
    expect(status(settled(), d('2027-12-31'), d('2026-12-31'))).toMatchObject({ phase: 'due_today', targetDate: '2027-12-31', isDefaultDate: true });
  });

  it('keeps unpaid obligations dated after the payout date out of the overdue amount but in the due amount', () => {
    const snap = snapshot({
      incomes: [income({ amount: '1,000.00', on: '2026-10-05' }), income({ amount: '300.00', on: '2027-01-01' })],
      payments: [payment({ amount: '100.00', on: '2026-12-31', allocations: [[2026, '100.00']] })],
    });
    const s = status(snap, d('2027-01-02'), d('2026-12-31'));
    expect(s).toMatchObject({ phase: 'settled_rolled', targetDate: '2027-12-31' });
    expect(s.perCurrency[0]).toEqual({ currency: 'CAD', dueMinor: m('30.00'), overdueMinor: 0 });
  });

  it('counts an obligation dated exactly on the payout date as overdue the day after', () => {
    const snap = snapshot({ incomes: [income({ amount: '500.00', on: '2026-12-31' })] });
    expect(status(snap, d('2027-01-01'), d('2026-12-31')).perCurrency[0]?.overdueMinor).toBe(m('50.00'));
  });

  it('counts an old opening obligation from a year before tracking as overdue', () => {
    const snap = snapshot({ openings: [opening({ amount: '80.00', on: '2024-03-01' })] });
    const s = status(snap, d('2027-01-01'), d('2026-12-31'));
    expect(s.phase).toBe('overdue');
    expect(s.perCurrency[0]?.overdueMinor).toBe(m('80.00'));
  });
});

describe('time zones decide which boundary day it is', () => {
  const planned = d('2026-12-31');
  it.each<[string, string, PayoutStatus['phase']]>([
    ['2026-12-31T03:29:59Z', 'America/St_Johns', 'upcoming'], // Dec 30, 23:59:59 NST
    ['2026-12-31T03:30:00Z', 'America/St_Johns', 'due_today'],
    ['2027-01-01T03:29:59Z', 'America/St_Johns', 'due_today'],
    ['2027-01-01T03:30:00Z', 'America/St_Johns', 'overdue'],
    ['2026-12-30T09:59:59Z', 'Pacific/Kiritimati', 'upcoming'],
    ['2026-12-30T10:00:00Z', 'Pacific/Kiritimati', 'due_today'],
    ['2026-12-31T10:00:00Z', 'Pacific/Kiritimati', 'overdue'],
    ['2027-01-01T04:59:59Z', 'America/Toronto', 'due_today'],
    ['2027-01-01T05:00:00Z', 'America/Toronto', 'overdue'],
  ])('%s in %s is %s', (instant, zone, phase) => {
    expect(status(unpaid(), todayInZone(new Date(instant), zone), planned, true).phase).toBe(phase);
  });
});

// ---- Random ledgers --------------------------------------------------------------------------

const dateBetween = (min: string, max: string) =>
  fc.integer({ min: toEpochDay(d(min)), max: toEpochDay(d(max)) }).map(fromEpochDay);

/** Valid random ledgers: refunds never exceed their income, allocations never exceed their payment. */
const ledgerArb = fc
  .record({
    incomes: fc.array(
      fc.record({
        amount: fc.integer({ min: 1, max: 500_000 }),
        on: dateBetween('2026-10-03', '2028-06-30'),
        currency: fc.constantFrom('CAD' as const, 'USD' as const),
        refunds: fc.array(fc.tuple(fc.integer({ min: 1, max: 1_000_000 }), fc.integer({ min: 0, max: 500 })), { maxLength: 3 }),
      }),
      { maxLength: 8 },
    ),
    openings: fc.array(
      fc.record({ amount: fc.integer({ min: 1, max: 50_000 }), on: dateBetween('2024-01-01', '2028-06-30'), currency: fc.constantFrom('CAD' as const, 'USD' as const) }),
      { maxLength: 3 },
    ),
    payments: fc.array(
      fc.record({
        amount: fc.integer({ min: 1, max: 100_000 }),
        on: dateBetween('2026-10-03', '2028-06-30'),
        currency: fc.constantFrom('CAD' as const, 'USD' as const),
        allocations: fc.array(fc.tuple(fc.integer({ min: 2024, max: 2028 }), fc.integer({ min: 1, max: 1_000_000 })), { maxLength: 3 }),
      }),
      { maxLength: 5 },
    ),
  })
  .map((spec): LedgerSnapshot => {
    const incomes = spec.incomes.map((r, i) => income({ amount: r.amount, on: r.on, currency: r.currency, id: `inc-${i}` }));
    const adjustments = spec.incomes.flatMap((r, i) => {
      let remaining = r.amount;
      return r.refunds.flatMap(([seed, offset], k) => {
        if (remaining === 0) return [];
        const amount = 1 + (seed % remaining);
        remaining -= amount;
        const on = fromEpochDay(Math.min(toEpochDay(r.on) + offset, toEpochDay(d('2028-12-31'))));
        return [adjustment({ incomeId: `inc-${i}`, amount, on, id: `adj-${i}-${k}` })];
      });
    });
    const openings = spec.openings.map((r, i) => opening({ amount: r.amount, on: r.on, currency: r.currency, id: `open-${i}` }));
    const payments = spec.payments.map((r, i) => {
      let remaining = r.amount;
      const used = new Set<number>();
      const allocations: [number, number][] = [];
      for (const [year, seed] of r.allocations) {
        if (remaining === 0 || used.has(year)) continue;
        used.add(year);
        const amount = 1 + (seed % remaining);
        remaining -= amount;
        allocations.push([year, amount]);
      }
      return payment({ amount: r.amount, on: r.on, currency: r.currency, id: `pay-${i}`, allocations });
    });
    return snapshot({ incomes, adjustments, openings, payments });
  });

describe('payout invariants over random ledgers (property)', () => {
  it('phase, day counts, target date and amounts follow §3.8 for any today / planned date', () => {
    fc.assert(
      fc.property(ledgerArb, dateBetween('2026-10-03', '2029-12-31'), dateBetween('2026-10-03', '2029-12-31'), fc.boolean(), (snap, today, planned, isDefault) => {
        const events = deriveObligationEvents(snap);
        const balances = computeBalances(snap, trackingStart, events);
        const s = computePayoutStatus({ today, plannedDate: planned, isDefaultDate: isDefault, balances, events });
        const delta = daysBetween(today, planned);

        expect(s.plannedDate).toBe(planned);
        expect(s.perCurrency.map((c) => c.currency)).toEqual(['CAD', 'USD']);
        for (const c of s.perCurrency) {
          expect(c.dueMinor).toBe(balances[c.currency].stillToGiveMinor);
          expect(c.overdueMinor).toBeGreaterThanOrEqual(0);
          // Overdue is a part of what is still to give, never more.
          expect(c.overdueMinor).toBeLessThanOrEqual(c.dueMinor);
          if (delta >= 0) expect(c.overdueMinor).toBe(0);
        }
        const anyOverdue = s.perCurrency.some((c) => c.overdueMinor > 0);

        if (delta > 0) {
          expect(s).toMatchObject({ phase: 'upcoming', targetDate: planned, daysUntil: delta, daysOverdue: null, isDefaultDate: isDefault });
        } else if (delta === 0) {
          expect(s).toMatchObject({ phase: 'due_today', targetDate: planned, daysUntil: null, daysOverdue: null, label: 'Due today', isDefaultDate: isDefault });
        } else if (anyOverdue) {
          expect(s).toMatchObject({ phase: 'overdue', targetDate: planned, daysUntil: null, daysOverdue: -delta, isDefaultDate: isDefault });
        } else {
          const rolled = endOfYear(yearOf(today));
          expect(s.targetDate).toBe(rolled);
          expect(s.isDefaultDate).toBe(true);
          expect(s.daysOverdue).toBeNull();
          if (rolled === today) expect(s).toMatchObject({ phase: 'due_today', daysUntil: null });
          else expect(s).toMatchObject({ phase: 'settled_rolled', daysUntil: daysBetween(today, rolled) });
        }
        if (s.daysUntil !== null) expect(s.daysUntil).toBeGreaterThan(0);
      }),
      { numRuns: 300 },
    );
  });

  it('with no payments, overdue is exactly the positive part of each bucket accrued through the payout date', () => {
    fc.assert(
      fc.property(ledgerArb, dateBetween('2026-10-03', '2029-12-31'), (snapWithPayments, payoutDate) => {
        const snap = { ...snapWithPayments, payments: [] };
        const events = deriveObligationEvents(snap);
        const balances = computeBalances(snap, trackingStart, events);
        for (const currency of ['CAD', 'USD'] as const) {
          // Independent oracle: bucket sums of records dated on or before the payout date.
          const through = new Map<number, number>();
          const bump = (year: number, amount: number): void => {
            through.set(year, (through.get(year) ?? 0) + amount);
          };
          for (const e of events) if (e.currency === currency && e.date <= payoutDate) bump(e.bucketYear, e.amountMinor);
          const full = new Map(balances[currency].buckets.map((b) => [b.year, b.accruedMinor as number]));
          let expected = 0;
          for (const [year, value] of through) expected += Math.max(0, Math.min(value, full.get(year) ?? 0));
          // Credits from negative buckets are applied oldest first and reduce what is overdue.
          const credit = balances[currency].buckets.reduce((sum, b) => sum + b.creditAppliedMinor, 0);
          const overdue = computeOverdue(balances[currency], events, payoutDate);
          expect(overdue).toBeLessThanOrEqual(expected);
          if (credit === 0) expect(overdue).toBe(expected);
        }
      }),
      { numRuns: 300 },
    );
  });
});
