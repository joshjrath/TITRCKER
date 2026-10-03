/**
 * Adversarial tests for the strict amount parser and integer money helpers (ARCHITECTURE §3.1–3.2).
 * Expected behaviour is re-derived from the architecture document, not from the implementation.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { MAX_AMOUNT_MINOR } from './constants';
import {
  addMinor,
  formatMinor,
  negMinor,
  parseAmount,
  subMinor,
  sumMinor,
  toMinor,
  type AmountParseError,
  type Minor,
} from './money';

/** Independent reference grammar for an accepted amount body (after trim and optional `$`). */
const REFERENCE_ACCEPTED = /^(?:(?:0|[1-9][0-9]*|[1-9][0-9]{0,2}(?:,[0-9]{3})+)(?:\.[0-9]{1,2})?|\.[0-9]{1,2})$/;

/** Independent reference value: digits only, cents padded, via BigInt. */
function referenceValue(body: string): bigint {
  const [whole = '', fraction = ''] = body.split('.');
  return BigInt((whole.replaceAll(',', '') || '0') + fraction.padEnd(2, '0'));
}

const validMinorArb = fc.integer({ min: 1, max: MAX_AMOUNT_MINOR });

const expectError = (input: string, error: AmountParseError): void => {
  expect(parseAmount(input), JSON.stringify(input)).toEqual({ ok: false, error });
};

describe('parseAmount: round trips every valid amount', () => {
  it('accepts formatMinor output (grouped and ungrouped, with $, padded with outer whitespace)', () => {
    fc.assert(
      fc.property(
        validMinorArb,
        fc.boolean(),
        fc.boolean(),
        fc.constantFrom('', ' ', '\t', '  \n'),
        (minor, grouping, dollar, pad) => {
          const text = `${pad}${dollar ? '$' : ''}${formatMinor(toMinor(minor), { grouping })}${pad}`;
          expect(parseAmount(text)).toEqual({ ok: true, minor });
        },
      ),
      { numRuns: 2000 },
    );
  });

  it('accepts one-decimal and no-decimal forms of the same value', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 999_999_999 }), fc.integer({ min: 0, max: 9 }), (whole, tenth) => {
        expect(parseAmount(String(whole))).toEqual({ ok: true, minor: whole * 100 });
        expect(parseAmount(`${whole}.${tenth}`)).toEqual({ ok: true, minor: whole * 100 + tenth * 10 });
      }),
    );
  });
});

describe('parseAmount: never accepts anything outside the strict grammar', () => {
  const alphabet = fc.constantFrom(...'0123456789,.$ -+eE'.split(''));
  it('random strings over the amount alphabet are accepted iff the reference grammar accepts them', () => {
    fc.assert(
      fc.property(fc.string({ unit: alphabet, maxLength: 16 }), (raw) => {
        const trimmed = raw.trim();
        const body = trimmed.startsWith('$') ? trimmed.slice(1) : trimmed;
        const result = parseAmount(raw);
        if (!REFERENCE_ACCEPTED.test(body)) {
          expect(result.ok, JSON.stringify(raw)).toBe(false);
          return;
        }
        const value = referenceValue(body);
        if (value === 0n) expect(result).toEqual({ ok: false, error: 'zero' });
        else if (value > BigInt(MAX_AMOUNT_MINOR)) expect(result).toEqual({ ok: false, error: 'too_large' });
        else expect(result).toEqual({ ok: true, minor: Number(value) });
      }),
      { numRuns: 5000 },
    );
  });

  it('rejects a valid amount with any inner whitespace inserted', () => {
    fc.assert(
      fc.property(validMinorArb, fc.nat(), fc.constantFrom(' ', '\t', ' ', ' '), (minor, at, space) => {
        const text = formatMinor(toMinor(minor));
        const cut = 1 + (at % (text.length - 1)); // strictly inside
        expect(parseAmount(text.slice(0, cut) + space + text.slice(cut)).ok).toBe(false);
      }),
    );
  });

  it('rejects any sign, before or after the $', () => {
    fc.assert(
      fc.property(validMinorArb, fc.constantFrom('-', '+', '\u2212', '\ufe62', '\ufe63', '\uff0d', '\uff0b'), fc.boolean(), (minor, sign, afterDollar) => {
        const text = formatMinor(toMinor(minor));
        expectError(afterDollar ? `$${sign}${text}` : `${sign}$${text}`, 'negative');
        expectError(`${sign}${text}`, 'negative');
      }),
    );
  });

  it('rejects non-ASCII digits and currency codes/letters', () => {
    for (const input of ['١٢٣', '１２', '१००', '12CAD', 'CAD 12', 'USD12', '12 $', '5$', '€5', '£5', '12¢']) {
      expect(parseAmount(input).ok, input).toBe(false);
    }
  });

  it('rejects superfluous leading zeros in every position', () => {
    for (const input of ['00', '01', '00.50', '0,000', '01,000', '0,123.45', '$007']) expectError(input, 'invalid_format');
  });

  it('rejects wrong grouping and European formats', () => {
    for (const input of ['1,75.00', '1,7500', '12,34', '1,000,00', '1,0000.00', ',100', '1,,000', '1.750,00', '1 750', "1'750", '1_750']) {
      expectError(input, 'invalid_format');
    }
  });

  it('rejects trailing dots and bare symbols', () => {
    for (const input of ['5.', '1,000.', '.', '$.', '$', '$$5', '0.']) expectError(input, 'invalid_format');
  });

  it('reports the documented error for each documented rejection', () => {
    expectError('', 'empty');
    expectError('   ', 'empty');
    expectError('1e3', 'scientific');
    expectError('1.5E2', 'scientific');
    expectError('1.234', 'too_many_decimals');
    expectError('0.001', 'too_many_decimals');
    expectError('0', 'zero');
    expectError('0.00', 'zero');
    expectError('.0', 'zero');
    expectError('$0', 'zero');
    expectError('999,999,999.991', 'too_many_decimals');
    expectError('1,000,000,000', 'too_large');
    expectError('1000000000.00', 'too_large');
    expectError('99999999999999999999999999', 'too_large');
  });

  it('accepts the exact boundaries of the safe limit', () => {
    expect(parseAmount('0.01')).toEqual({ ok: true, minor: 1 });
    expect(parseAmount('.01')).toEqual({ ok: true, minor: 1 });
    expect(parseAmount('999,999,999.99')).toEqual({ ok: true, minor: MAX_AMOUNT_MINOR });
    expect(parseAmount('$999999999.99')).toEqual({ ok: true, minor: MAX_AMOUNT_MINOR });
  });
});

describe('parseAmount: hostile input sizes', () => {
  it('rejects very long digit strings in linear time (no catastrophic regex backtracking)', () => {
    const hostile = ['1'.repeat(100_000) + 'x', '1.'.repeat(50_000) + 'e', '1,'.repeat(50_000) + 'E5x', '9'.repeat(200_000)];
    const started = performance.now();
    for (const input of hostile) expect(parseAmount(input).ok).toBe(false);
    expect(performance.now() - started).toBeLessThan(500);
  });

  it('still classifies very long scientific notation correctly', () => {
    expectError('1'.repeat(10_000) + 'e5', 'scientific');
    expectError('9'.repeat(400), 'too_large');
  });
});

describe('integer money helpers refuse to lose precision', () => {
  const big = toMinor(Number.MAX_SAFE_INTEGER);

  it('addMinor / sumMinor throw instead of rounding past 2^53', () => {
    expect(() => addMinor(big, toMinor(1))).toThrow(RangeError);
    expect(() => sumMinor([big, toMinor(1), toMinor(-1)])).toThrow(RangeError);
    expect(() => sumMinor(Array.from({ length: 90_072 }, () => toMinor(MAX_AMOUNT_MINOR)))).toThrow(RangeError);
    expect(sumMinor(Array.from({ length: 90_071 }, () => toMinor(MAX_AMOUNT_MINOR)))).toBe(
      Number(90_071n * BigInt(MAX_AMOUNT_MINOR)),
    );
  });

  it('subMinor / negMinor throw on overflow and on unsafe operands smuggled in by a cast', () => {
    expect(() => subMinor(toMinor(-Number.MAX_SAFE_INTEGER), toMinor(1))).toThrow(RangeError);
    const unsafe = (Number.MAX_SAFE_INTEGER + 3) as Minor; // not exactly representable as an integer amount
    expect(() => subMinor(unsafe, toMinor(10))).toThrow(RangeError);
    expect(() => subMinor(toMinor(1), 0.5 as Minor)).toThrow(RangeError);
    expect(() => negMinor(Number.NaN as Minor)).toThrow(RangeError);
  });
});
