import { describe, expect, it } from 'vitest';
import * as domain from './index';
import { CURRENCY_META, HALF_UP_OFFSET_BPS, isCurrency, MAX_AMOUNT_MINOR, MINOR_PER_MAJOR, TITHE_RATE_BPS } from './constants';

describe('constants', () => {
  it('pins the money policy', () => {
    expect(MAX_AMOUNT_MINOR).toBe(99_999_999_999);
    expect(TITHE_RATE_BPS).toBe(1000);
    expect(HALF_UP_OFFSET_BPS).toBe(5000);
    expect(MINOR_PER_MAJOR).toBe(100);
    expect(CURRENCY_META.CAD.code).toBe('CAD');
  });

  it('recognises only supported currency codes', () => {
    expect(isCurrency('CAD')).toBe(true);
    expect(isCurrency('USD')).toBe(true);
    expect(isCurrency('cad')).toBe(false);
    expect(isCurrency('EUR')).toBe(false);
    expect(isCurrency(1)).toBe(false);
  });

  it('exposes the whole domain through the index', () => {
    for (const name of ['parseAmount', 'computeTithe', 'todayInZone', 'computeBalances', 'proposeAllocation', 'computePayoutStatus', 'cumulativeSeries', 'buildLedgerCsv', 'buildBackup', 'setAsideBalance', 'buildLedgerRows', 'deriveObligationEvents', 'periodRangeForYear']) {
      expect(typeof (domain as Record<string, unknown>)[name]).toBe('function');
    }
  });
});
