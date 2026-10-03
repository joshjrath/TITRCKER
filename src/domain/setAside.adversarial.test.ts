/**
 * Adversarial tests for set-aside balances and history (ARCHITECTURE §3.9).
 *
 * Reference reading of "the running balance in date order may never go negative": entries are
 * ordered by date with reserves before releases on the same day, so the condition is equivalent
 * to "no end-of-day balance is negative".
 */
import fc from 'fast-check';
import { beforeEach, describe, expect, it } from 'vitest';
import { CURRENCIES, type Currency } from './constants';
import { computeBalances } from './balances';
import type { SetAsideRecord } from './records';
import { setAsideBalance, setAsideHistory, stillToSetAside, validateSetAsideHistory } from './setAside';
import { income, m, resetFixtureSequence, setAside, snapshot } from './testFixtures';
import { toLocalDate } from './dates';
import { toMinor } from './money';

beforeEach(() => resetFixtureSequence());

const entriesArb = fc
  .array(
    fc.record({
      kind: fc.constantFrom<'reserve' | 'release'>('reserve', 'release'),
      amount: fc.integer({ min: 1, max: 10_000 }),
      day: fc.integer({ min: 1, max: 6 }),
      currency: fc.constantFrom<Currency>(...CURRENCIES),
      second: fc.integer({ min: 0, max: 59 }),
    }),
    { maxLength: 14 },
  )
  .map((specs) =>
    specs.map((spec, i) =>
      setAside({
        id: `sa-${String(i).padStart(2, '0')}`,
        kind: spec.kind,
        amount: spec.amount,
        on: `2026-10-0${spec.day}`,
        currency: spec.currency,
        createdAt: `2026-10-01T00:00:${String(spec.second).padStart(2, '0')}.000Z`,
      }),
    ),
  );

/** Independent oracle: end-of-day balances per currency, in date order. */
function endOfDayBalances(records: readonly SetAsideRecord[], currency: Currency): [string, number][] {
  const byDay = new Map<string, number>();
  for (const r of records.filter((x) => x.currency === currency)) {
    byDay.set(r.effectiveOn, (byDay.get(r.effectiveOn) ?? 0) + (r.kind === 'reserve' ? r.amountMinor : -r.amountMinor));
  }
  let running = 0;
  return [...byDay.keys()].sort().map((day) => {
    running += byDay.get(day) ?? 0;
    return [day, running];
  });
}

describe('set-aside invariants (property)', () => {
  it('valid iff no end-of-day balance is negative; failure names the first such currency/date', () => {
    fc.assert(
      fc.property(entriesArb, (records) => {
        const verdict = validateSetAsideHistory(records);
        const firstBad = CURRENCIES.map((c) => ({ currency: c, bad: endOfDayBalances(records, c).find(([, b]) => b < 0) })).find((x) => x.bad);
        if (!firstBad?.bad) {
          expect(verdict).toEqual({ ok: true });
          return;
        }
        expect(verdict.ok).toBe(false);
        if (verdict.ok) return;
        expect(verdict.currency).toBe(firstBad.currency);
        expect(verdict.date).toBe(firstBad.bad[0]);
        expect(verdict.shortfallMinor).toBeGreaterThan(0);
        expect(verdict.shortfallMinor).toBeLessThanOrEqual(-firstBad.bad[1]);
      }),
      { numRuns: 1000 },
    );
  });

  it('balance = reserves − releases = last running balance, independent of input order and of the other currency', () => {
    fc.assert(
      fc.property(entriesArb, (records) => {
        for (const currency of CURRENCIES) {
          const own = records.filter((r) => r.currency === currency);
          const expected = own.reduce((s, r) => s + (r.kind === 'reserve' ? r.amountMinor : -r.amountMinor), 0);
          expect(setAsideBalance(records, currency)).toBe(expected);
          const history = setAsideHistory(records, currency);
          expect(history.at(-1)?.runningBalanceMinor ?? 0).toBe(expected);
          expect(setAsideHistory([...records].reverse(), currency)).toEqual(history);
          expect(setAsideHistory(own, currency)).toEqual(history);
          for (let i = 1; i < history.length; i += 1) {
            expect((history[i - 1]?.effectiveOn ?? '') <= (history[i]?.effectiveOn ?? '')).toBe(true);
          }
        }
        // input is never mutated
        const copy = records.map((r) => ({ ...r }));
        setAsideHistory(records, 'CAD');
        expect(records).toEqual(copy);
      }),
    );
  });
});

describe('set-aside scenarios', () => {
  it('a USD reserve can never cover a CAD release', () => {
    const records = [
      setAside({ kind: 'reserve', amount: '100.00', on: '2026-10-03', currency: 'USD' }),
      setAside({ kind: 'release', amount: '1.00', on: '2026-10-04', currency: 'CAD' }),
    ];
    expect(validateSetAsideHistory(records)).toEqual({ ok: false, currency: 'CAD', date: toLocalDate('2026-10-04'), shortfallMinor: m('1.00') });
  });

  it('a same-day reserve covers a release recorded earlier that day (date order, reserves first)', () => {
    const records = [
      setAside({ kind: 'release', amount: '50.00', on: '2026-10-05', createdAt: '2026-10-05T09:00:00.000Z', paymentId: 'pay-1' }),
      setAside({ kind: 'reserve', amount: '50.00', on: '2026-10-05', createdAt: '2026-10-05T18:00:00.000Z' }),
    ];
    expect(validateSetAsideHistory(records)).toEqual({ ok: true });
    expect(setAsideHistory(records, 'CAD').map((r) => r.runningBalanceMinor)).toEqual([m('50.00'), 0]);
  });

  it('a later reserve cannot rescue an earlier dip', () => {
    const records = [
      setAside({ kind: 'reserve', amount: '10.00', on: '2026-10-03' }),
      setAside({ kind: 'release', amount: '30.00', on: '2026-10-04' }),
      setAside({ kind: 'reserve', amount: '100.00', on: '2026-10-05' }),
    ];
    expect(setAsideBalance(records, 'CAD')).toBe(m('80.00'));
    expect(validateSetAsideHistory(records)).toMatchObject({ ok: false, date: '2026-10-04', shortfallMinor: m('20.00') });
  });

  it('empty history is valid with zero balance', () => {
    expect(validateSetAsideHistory([])).toEqual({ ok: true });
    expect(setAsideBalance([], 'CAD')).toBe(0);
    expect(setAsideHistory([], 'USD')).toEqual([]);
  });

  it('reserving never changes what is owed; still to set aside = max(0, still to give − set aside)', () => {
    const incomes = [income({ amount: '1,750.00', on: '2026-10-03' }), income({ amount: '249.99', on: '2026-10-04' })];
    const without = computeBalances(snapshot({ incomes }), toLocalDate('2026-10-03')).CAD;
    const setAsides = [setAside({ kind: 'reserve', amount: '500.00', on: '2026-10-05' })];
    const withReserve = computeBalances(snapshot({ incomes, setAsides }), toLocalDate('2026-10-03')).CAD;
    expect(withReserve.stillToGiveMinor).toBe(without.stillToGiveMinor);
    expect(withReserve.accruedMinor).toBe(without.accruedMinor);
    expect(withReserve.stillToSetAsideMinor).toBe(0);
    expect(stillToSetAside(toMinor(15_000), toMinor(10_000))).toBe(5_000);
    expect(stillToSetAside(toMinor(0), toMinor(10_000))).toBe(0);
  });
});
