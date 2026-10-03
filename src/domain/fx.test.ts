import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { toLocalDate } from './dates';
import { combineAmountsInCad, combineStillToGiveInCad, convertUsdToCadMinor, type FxRate, parseFxRate } from './fx';
import { MAX_AMOUNT_MINOR } from './constants';
import { toMinor } from './money';

const rate = (value: string): FxRate => ({
  base: 'USD',
  quote: 'CAD',
  rate: value,
  observedOn: toLocalDate('2026-10-02'),
  source: 'bank_of_canada',
  fetchedAt: '2026-10-03T12:00:00.000Z',
  stale: false,
});

describe('parseFxRate', () => {
  it.each(['1.3712', '1.35', '0.5', '3.0', '1.12345678'])('accepts %s', (text) => {
    expect(parseFxRate(text)).not.toBeNull();
  });

  it.each(['1e0', '-1.3', '+1.3', '1.3.4', ' 1.37', '1.37 ', '1', '1.', '.5', '0.4999', '3.0001', '1.123456789', 'NaN', '', '１.３'])(
    'rejects %j',
    (text) => {
      expect(parseFxRate(text)).toBeNull();
    },
  );
});

describe('convertUsdToCadMinor', () => {
  it('converts exactly and rounds half-up to the cent', () => {
    expect(convertUsdToCadMinor(toMinor(10_000), '1.3500')).toBe(13_500); // USD 100.00 → CAD 135.00
    expect(convertUsdToCadMinor(toMinor(4_000), '1.3712')).toBe(5_485); // 54.848 → 54.85
    expect(convertUsdToCadMinor(toMinor(1), '1.3750')).toBe(1); // 0.01375 → 0.01
    expect(convertUsdToCadMinor(toMinor(2), '1.3750')).toBe(3); // 0.0275 → 0.03
    expect(convertUsdToCadMinor(toMinor(0), '1.3712')).toBe(0);
  });

  it('is symmetric for negative amounts', () => {
    expect(convertUsdToCadMinor(toMinor(-2), '1.3750')).toBe(-3);
  });

  it('handles the largest supported amount without precision loss', () => {
    // 99,999,999,999 × 1.3712 = 137,119,999,998.6288 → 137,119,999,999
    expect(convertUsdToCadMinor(toMinor(MAX_AMOUNT_MINOR), '1.3712')).toBe(137_119_999_999);
  });

  it('matches an exact rational reference for random amounts and rates (property)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: MAX_AMOUNT_MINOR }), fc.integer({ min: 5_000, max: 30_000 }), (cents, rate4) => {
        const text = `${Math.floor(rate4 / 10_000)}.${String(rate4 % 10_000).padStart(4, '0')}`;
        const exact = BigInt(cents) * BigInt(rate4); // CAD cents × 10^4
        const expected = Number((exact * 2n + 10_000n) / 20_000n);
        expect(convertUsdToCadMinor(toMinor(cents), text)).toBe(expected);
      }),
    );
  });

  it('refuses an invalid rate', () => {
    expect(() => convertUsdToCadMinor(toMinor(100), '9.99')).toThrow(RangeError);
  });
});

describe('combineStillToGiveInCad', () => {
  it('sums CAD with converted USD and keeps the parts', () => {
    const combined = combineStillToGiveInCad({ CAD: toMinor(15_000), USD: toMinor(1_000) }, rate('1.3500'));
    expect(combined).toMatchObject({ totalCadMinor: 16_350, cadMinor: 15_000, usdMinor: 1_000, usdInCadMinor: 1_350 });
  });

  it('needs no rate when nothing is owed in USD', () => {
    expect(combineStillToGiveInCad({ CAD: toMinor(15_000), USD: toMinor(0) }, null)).toMatchObject({
      totalCadMinor: 15_000,
      usdInCadMinor: 0,
      rate: null,
    });
  });

  it('returns null when USD is owed but no rate is available', () => {
    expect(combineStillToGiveInCad({ CAD: toMinor(15_000), USD: toMinor(1_000) }, null)).toBeNull();
  });
});

describe('combineAmountsInCad', () => {
  it("matches the owner's report: income and tithe with USD at 1.4145", () => {
    // USD 1,750.00 × 1.4145 = 2,475.375 → CAD 2,475.38 (half-up)
    expect(convertUsdToCadMinor(toMinor(175_000), '1.4145')).toBe(247_538);
    expect(combineAmountsInCad({ CAD: toMinor(520_300), USD: toMinor(175_000) }, '1.4145')).toEqual({
      totalCadMinor: 767_838,
      cadMinor: 520_300,
      usdMinor: 175_000,
      usdInCadMinor: 247_538,
    });
    // Tithe: USD 175.00 × 1.4145 = 247.5375 → CAD 247.54; CAD 520.30 + 247.54 = CAD 767.84
    expect(combineAmountsInCad({ CAD: toMinor(52_030), USD: toMinor(17_500) }, '1.4145')).toEqual({
      totalCadMinor: 76_784,
      cadMinor: 52_030,
      usdMinor: 17_500,
      usdInCadMinor: 24_754,
    });
  });

  it('matches the E2E journey at the pinned rate 1.3500', () => {
    expect(combineAmountsInCad({ CAD: toMinor(199_999), USD: toMinor(10_000) }, '1.3500')?.totalCadMinor).toBe(213_499);
    expect(combineAmountsInCad({ CAD: toMinor(20_000), USD: toMinor(1_000) }, '1.3500')?.totalCadMinor).toBe(21_350);
    expect(combineAmountsInCad({ CAD: toMinor(5_000), USD: toMinor(0) }, '1.3500')?.totalCadMinor).toBe(5_000);
  });

  it('rounds the converted USD half-up to the cent', () => {
    expect(combineAmountsInCad({ CAD: toMinor(0), USD: toMinor(2) }, '1.3750')?.usdInCadMinor).toBe(3); // 0.0275 → 0.03
    expect(combineAmountsInCad({ CAD: toMinor(0), USD: toMinor(1) }, '1.3750')?.usdInCadMinor).toBe(1); // 0.01375 → 0.01
  });

  it('works for negative amounts (symmetric rounding)', () => {
    expect(combineAmountsInCad({ CAD: toMinor(-1_000), USD: toMinor(-2) }, '1.3750')).toEqual({
      totalCadMinor: -1_003,
      cadMinor: -1_000,
      usdMinor: -2,
      usdInCadMinor: -3,
    });
    expect(combineAmountsInCad({ CAD: toMinor(5_000), USD: toMinor(-1_000) }, '1.3500')?.totalCadMinor).toBe(3_650);
  });

  it('needs no rate when there is no USD', () => {
    expect(combineAmountsInCad({ CAD: toMinor(12_345), USD: toMinor(0) }, null)).toEqual({
      totalCadMinor: 12_345,
      cadMinor: 12_345,
      usdMinor: 0,
      usdInCadMinor: 0,
    });
  });

  it('returns null (never a guess) when there is USD but no rate', () => {
    expect(combineAmountsInCad({ CAD: toMinor(12_345), USD: toMinor(1) }, null)).toBeNull();
    expect(combineAmountsInCad({ CAD: toMinor(0), USD: toMinor(-1) }, null)).toBeNull();
  });

  it('refuses an invalid rate instead of guessing', () => {
    expect(() => combineAmountsInCad({ CAD: toMinor(0), USD: toMinor(100) }, '9.99')).toThrow(RangeError);
  });
});
