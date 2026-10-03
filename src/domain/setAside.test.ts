import { beforeEach, describe, expect, it } from 'vitest';
import { setAsideBalance, setAsideHistory, stillToSetAside, validateSetAsideHistory } from './setAside';
import { m, resetFixtureSequence, setAside } from './testFixtures';
import { toMinor } from './money';

beforeEach(() => resetFixtureSequence());

describe('set aside', () => {
  it('computes balance and running history per currency', () => {
    const records = [
      setAside({ kind: 'release', amount: '30.00', on: '2026-10-10', id: 'c' }),
      setAside({ kind: 'reserve', amount: '100.00', on: '2026-10-05', id: 'a' }),
      setAside({ kind: 'reserve', amount: '20.00', on: '2026-10-10', id: 'b' }),
      setAside({ kind: 'reserve', amount: '999.00', on: '2026-10-01', currency: 'USD', id: 'u' }),
    ];
    expect(setAsideBalance(records, 'CAD')).toBe(m('90.00'));
    expect(setAsideBalance(records, 'USD')).toBe(m('999.00'));
    expect(setAsideHistory(records, 'CAD').map((r) => [r.id, r.runningBalanceMinor])).toEqual([
      ['a', 10000],
      ['b', 12000], // reserve before release on the same day
      ['c', 9000],
    ]);
  });

  it('rejects a history whose running balance goes negative', () => {
    const records = [
      setAside({ kind: 'reserve', amount: '50.00', on: '2026-10-10' }),
      setAside({ kind: 'release', amount: '20.00', on: '2026-10-05' }),
    ];
    expect(validateSetAsideHistory(records)).toEqual({
      ok: false,
      currency: 'CAD',
      date: '2026-10-05',
      shortfallMinor: m('20.00'),
    });
  });

  it('accepts a release equal to the balance and checks currencies separately', () => {
    const records = [
      setAside({ kind: 'reserve', amount: '50.00', on: '2026-10-05' }),
      setAside({ kind: 'release', amount: '50.00', on: '2026-10-05' }),
      setAside({ kind: 'reserve', amount: '10.00', on: '2026-10-01', currency: 'USD' }),
    ];
    expect(validateSetAsideHistory(records)).toEqual({ ok: true });
    const crossCurrency = [
      setAside({ kind: 'reserve', amount: '50.00', on: '2026-10-05', currency: 'CAD' }),
      setAside({ kind: 'release', amount: '10.00', on: '2026-10-06', currency: 'USD' }),
    ];
    expect(validateSetAsideHistory(crossCurrency)).toMatchObject({ ok: false, currency: 'USD' });
  });

  it('computes still to set aside as a positive remainder', () => {
    expect(stillToSetAside(m('150.00'), m('100.00'))).toBe(m('50.00'));
    expect(stillToSetAside(m('150.00'), m('200.00'))).toBe(0);
    expect(stillToSetAside(toMinor(0), toMinor(0))).toBe(0);
  });
});
