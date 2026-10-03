import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { MAX_AMOUNT_MINOR } from './constants';
import {
  addMinor,
  AMOUNT_ERROR_MESSAGES,
  clampZero,
  formatMinor,
  formatMoney,
  isValidAmountMinor,
  maxMinor,
  minMinor,
  minorToDecimalString,
  negMinor,
  parseAmount,
  splitMinor,
  subMinor,
  sumMinor,
  toMinor,
  ZERO,
  type AmountParseError,
} from './money';

describe('toMinor and checked arithmetic', () => {
  it('accepts safe integers and normalises -0', () => {
    expect(toMinor(175000)).toBe(175000);
    expect(Object.is(toMinor(-0), 0)).toBe(true);
  });

  it.each([0.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects %s', (n) => {
    expect(() => toMinor(n)).toThrow(RangeError);
  });

  it('adds, subtracts, negates and compares', () => {
    expect(addMinor(toMinor(175000), toMinor(24999))).toBe(199999);
    expect(subMinor(toMinor(20000), toMinor(5000))).toBe(15000);
    expect(negMinor(toMinor(2500))).toBe(-2500);
    expect(maxMinor(toMinor(1), toMinor(2))).toBe(2);
    expect(minMinor(toMinor(1), toMinor(2))).toBe(1);
    expect(clampZero(toMinor(-5))).toBe(0);
    expect(clampZero(toMinor(5))).toBe(5);
    expect(sumMinor([])).toBe(ZERO);
  });

  it('guards against overflow instead of losing precision', () => {
    const big = toMinor(Number.MAX_SAFE_INTEGER);
    expect(() => addMinor(big, toMinor(1))).toThrow(RangeError);
    expect(() => subMinor(negMinor(big), toMinor(1))).toThrow(RangeError);
    expect(() => sumMinor([big, toMinor(1)])).toThrow(RangeError);
    // ~90,000 maximum-size entries still sum exactly
    expect(sumMinor(Array.from({ length: 90_000 }, () => toMinor(MAX_AMOUNT_MINOR)))).toBe(MAX_AMOUNT_MINOR * 90_000);
  });

  it('validates single amounts', () => {
    expect(isValidAmountMinor(1)).toBe(true);
    expect(isValidAmountMinor(MAX_AMOUNT_MINOR)).toBe(true);
    expect(isValidAmountMinor(0)).toBe(false);
    expect(isValidAmountMinor(MAX_AMOUNT_MINOR + 1)).toBe(false);
    expect(isValidAmountMinor(1.5)).toBe(false);
  });
});

describe('parseAmount (strict, ARCHITECTURE §3.2)', () => {
  it.each<[string, number]>([
    ['1750', 175000],
    ['1,750', 175000],
    ['1,750.00', 175000],
    ['$1,750.00', 175000],
    ['  12.30  ', 1230],
    ['249.99', 24999],
    ['0.05', 5],
    ['0.01', 1],
    ['5', 500],
    ['5.5', 550],
    ['.5', 50],
    ['.50', 50],
    ['0.5', 50],
    ['12,345,678', 1234567800],
    ['999,999,999.99', MAX_AMOUNT_MINOR],
    ['999999999.99', MAX_AMOUNT_MINOR],
    ['$.01', 1],
  ])('accepts %j -> %i', (input, minor) => {
    expect(parseAmount(input)).toEqual({ ok: true, minor });
  });

  it.each<[string, AmountParseError]>([
    ['', 'empty'],
    ['   ', 'empty'],
    ['-5', 'negative'],
    ['+5', 'negative'],
    ['$-5', 'negative'],
    ['-$5', 'negative'],
    ['−5', 'negative'],
    ['1e3', 'scientific'],
    ['1E3', 'scientific'],
    ['1.5e-2', 'scientific'],
    ['1.234', 'too_many_decimals'],
    ['0.001', 'too_many_decimals'],
    ['0', 'zero'],
    ['0.00', 'zero'],
    ['0.0', 'zero'],
    ['.00', 'zero'],
    ['$0', 'zero'],
    ['1,000,000,000.00', 'too_large'],
    ['1000000000', 'too_large'],
    ['99999999999999999999999', 'too_large'],
    ['5.', 'invalid_format'],
    ['1,75.00', 'invalid_format'],
    ['1,7500', 'invalid_format'],
    ['1.750,00', 'invalid_format'],
    ['1 750', 'invalid_format'],
    ['１２', 'invalid_format'],
    ['00.5', 'invalid_format'],
    ['012', 'invalid_format'],
    ['NaN', 'invalid_format'],
    ['Infinity', 'invalid_format'],
    ['0x10', 'invalid_format'],
    ['CAD 5', 'invalid_format'],
    ['5 CAD', 'invalid_format'],
    ['$', 'invalid_format'],
    ['$$5', 'invalid_format'],
    ['.', 'invalid_format'],
    [',750', 'invalid_format'],
    ['1,', 'invalid_format'],
    ['0,750', 'invalid_format'],
    ['1,750.', 'invalid_format'],
    ['1..5', 'invalid_format'],
    ['1.5.5', 'invalid_format'],
    ['e3', 'invalid_format'],
  ])('rejects %j with %s', (input, error) => {
    expect(parseAmount(input)).toEqual({ ok: false, error });
  });

  it('has a message for every error code', () => {
    for (const message of Object.values(AMOUNT_ERROR_MESSAGES)) expect(message.length).toBeGreaterThan(0);
    expect(AMOUNT_ERROR_MESSAGES.too_many_decimals).toBe('Use at most 2 decimal places.');
  });

  it('round-trips every valid amount through formatMinor (property)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: MAX_AMOUNT_MINOR }), fc.boolean(), (minor, grouping) => {
        const text = formatMinor(toMinor(minor), { grouping });
        expect(parseAmount(text)).toEqual({ ok: true, minor });
        expect(parseAmount(`$${text}`)).toEqual({ ok: true, minor });
      }),
    );
  });
});

describe('formatting', () => {
  it('formats with grouping and signs', () => {
    expect(formatMinor(toMinor(175000))).toBe('1,750.00');
    expect(formatMinor(toMinor(-2500))).toBe('-25.00');
    expect(formatMinor(toMinor(1))).toBe('0.01');
    expect(formatMinor(toMinor(0))).toBe('0.00');
    expect(formatMinor(toMinor(175000), { grouping: false })).toBe('1750.00');
    expect(formatMinor(toMinor(2500), { sign: 'always' })).toBe('+25.00');
    expect(formatMinor(toMinor(0), { sign: 'always' })).toBe('0.00');
    expect(formatMinor(toMinor(-2500), { sign: 'never' })).toBe('25.00');
    expect(formatMinor(toMinor(MAX_AMOUNT_MINOR))).toBe('999,999,999.99');
    expect(formatMinor(toMinor(100))).toBe('1.00');
    expect(formatMinor(toMinor(100000))).toBe('1,000.00');
  });

  it('formats code-prefixed money', () => {
    expect(formatMoney(toMinor(175000), 'CAD')).toBe('CAD 1,750.00');
    expect(formatMoney(toMinor(-2500), 'CAD')).toBe('-CAD 25.00');
    expect(formatMoney(toMinor(2500), 'USD', { sign: 'always' })).toBe('+USD 25.00');
  });

  it('produces export decimals and typographic parts', () => {
    expect(minorToDecimalString(toMinor(175000))).toBe('1750.00');
    expect(minorToDecimalString(toMinor(-2500))).toBe('-25.00');
    expect(minorToDecimalString(toMinor(-5))).toBe('-0.05');
    expect(splitMinor(toMinor(175000))).toEqual({ sign: '', whole: '1,750', fraction: '00' });
    expect(splitMinor(toMinor(-1234567))).toEqual({ sign: '-', whole: '12,345', fraction: '67' });
  });
});
