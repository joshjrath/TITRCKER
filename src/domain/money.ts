/**
 * Integer money: amounts are integer minor units (cents) held in safe-integer JS numbers.
 *
 * Policy (ARCHITECTURE §3.1–3.2): no floating-point arithmetic ever touches ledger math. Every
 * arithmetic helper here checks `Number.isSafeInteger` on its result and throws `RangeError`
 * instead of silently losing precision. Formatting works on digit strings, never on division.
 */
import {
  MAX_AMOUNT_MINOR,
  MIN_AMOUNT_MINOR,
  MINOR_DIGITS,
  THOUSANDS_GROUP_SIZE,
  type Currency,
} from './constants';

/** An integer number of minor units (cents). Always a safe integer; may be negative for deltas. */
export type Minor = number & { readonly __minor: unique symbol };

/**
 * Brands a number as {@link Minor}.
 * @throws RangeError unless `n` is a safe integer (rejects NaN, Infinity, fractions, >2^53).
 */
export function toMinor(n: number): Minor {
  if (!Number.isSafeInteger(n)) {
    throw new RangeError(`Minor amount must be a safe integer, got ${String(n)}`);
  }
  // Normalise -0 to 0 so equality and formatting are never surprised.
  return (n === 0 ? 0 : n) as Minor;
}

/** Zero minor units. */
export const ZERO: Minor = toMinor(0);

/** Sum of minor amounts. @throws RangeError if the result leaves the safe-integer range. */
export function addMinor(...xs: Minor[]): Minor {
  return sumMinor(xs);
}

/** `a - b`. @throws RangeError on overflow. */
export function subMinor(a: Minor, b: Minor): Minor {
  return toMinor(a - b);
}

/**
 * Sum of an iterable of minor amounts, checked after every step.
 * (Any inexact float sum of two safe integers is itself unsafe, so per-step checks are sufficient.)
 * @throws RangeError on overflow.
 */
export function sumMinor(xs: Iterable<Minor>): Minor {
  let total = 0;
  for (const x of xs) {
    total = toMinor(total + toMinor(x));
  }
  return toMinor(total);
}

/** `-a`. */
export function negMinor(a: Minor): Minor {
  return toMinor(-a);
}

/** Larger of two amounts. */
export function maxMinor(a: Minor, b: Minor): Minor {
  return a >= b ? a : b;
}

/** Smaller of two amounts. */
export function minMinor(a: Minor, b: Minor): Minor {
  return a <= b ? a : b;
}

/**
 * `max(0, a)`. Only for fields that are *defined* as positive remainders (still to give, credit,
 * outstanding). Never use it to hide a negative underlying balance.
 */
export function clampZero(a: Minor): Minor {
  return a > 0 ? a : ZERO;
}

// ---------------------------------------------------------------------------------------------
// Strict parser (ARCHITECTURE §3.2)
// ---------------------------------------------------------------------------------------------

export type AmountParseError =
  | 'empty'
  | 'invalid_format'
  | 'negative'
  | 'scientific'
  | 'too_many_decimals'
  | 'zero'
  | 'too_large';

export type AmountParseResult = { ok: true; minor: Minor } | { ok: false; error: AmountParseError };

/** Human-readable messages for every parse error, suitable for form field errors. */
export const AMOUNT_ERROR_MESSAGES: Record<AmountParseError, string> = {
  empty: 'Enter an amount.',
  invalid_format: 'Enter an amount like 1,750.00 using digits, an optional comma every three digits and a dot for cents.',
  negative: 'Enter the amount without a + or - sign.',
  scientific: 'Scientific notation is not supported. Type the full amount.',
  too_many_decimals: 'Use at most 2 decimal places.',
  zero: 'The amount must be greater than 0.00.',
  too_large: 'The amount must be 999,999,999.99 or less.',
};

const SIGN_CHARACTERS = /^[-+−﹣＋－]/;
const SCIENTIFIC_NOTATION = /^[\d.,]*\d[\d.,]*[eE][-+]?\d+$/;
/**
 * Optional integer part (plain digits without superfluous leading zeros, or exact groups of three
 * separated by commas), then an optional dot followed by at least one digit. The fraction length is
 * checked separately so "1.234" reports `too_many_decimals` rather than a generic format error.
 */
const AMOUNT_SHAPE = new RegExp(
  `^(?<int>0|[1-9]\\d*|[1-9]\\d{0,${THOUSANDS_GROUP_SIZE - 1}}(?:,\\d{${THOUSANDS_GROUP_SIZE}})+)?(?:\\.(?<frac>\\d+))?$`,
);

/**
 * Parses a user-typed amount into minor units, strictly.
 *
 * Accepted (after trimming outer whitespace): an optional leading `$`, then plain digits without
 * superfluous leading zeros or comma-grouped thousands in exact groups of three, followed by an
 * optional `.` and 1–2 decimal digits; or a bare fraction `.5` / `.50`.
 *
 * Everything else is rejected with a specific code: signs, scientific notation, more than two
 * decimals, wrong grouping, European formats, inner whitespace, non-ASCII digits, letters, a trailing
 * dot, zero, and anything above {@link MAX_AMOUNT_MINOR}. The value is assembled from digit strings
 * with BigInt, so no float is ever involved.
 */
export function parseAmount(input: string): AmountParseResult {
  const trimmed = input.trim();
  if (trimmed === '') return { ok: false, error: 'empty' };

  if (SIGN_CHARACTERS.test(trimmed)) return { ok: false, error: 'negative' };
  const body = trimmed.startsWith('$') ? trimmed.slice(1) : trimmed;
  if (SIGN_CHARACTERS.test(body)) return { ok: false, error: 'negative' };
  if (body === '') return { ok: false, error: 'invalid_format' };
  if (SCIENTIFIC_NOTATION.test(body)) return { ok: false, error: 'scientific' };

  const match = AMOUNT_SHAPE.exec(body);
  const integerPart = match?.groups?.int;
  const fractionPart = match?.groups?.frac;
  if (!match || (integerPart === undefined && fractionPart === undefined)) {
    return { ok: false, error: 'invalid_format' };
  }
  if (fractionPart !== undefined && fractionPart.length > MINOR_DIGITS) {
    return { ok: false, error: 'too_many_decimals' };
  }

  const wholeDigits = (integerPart ?? '0').replaceAll(',', '');
  const fractionDigits = (fractionPart ?? '').padEnd(MINOR_DIGITS, '0');
  const value = BigInt(wholeDigits + fractionDigits);

  if (value === 0n) return { ok: false, error: 'zero' };
  if (value > BigInt(MAX_AMOUNT_MINOR)) return { ok: false, error: 'too_large' };
  return { ok: true, minor: toMinor(Number(value)) };
}

// ---------------------------------------------------------------------------------------------
// Formatting (string-based; never divides a number)
// ---------------------------------------------------------------------------------------------

export type SignDisplay = 'auto' | 'always' | 'never';

/** Inserts a comma every three digits from the right of a plain digit string. */
function groupThousands(digits: string): string {
  const groups: string[] = [];
  for (let end = digits.length; end > 0; end -= THOUSANDS_GROUP_SIZE) {
    groups.unshift(digits.slice(Math.max(0, end - THOUSANDS_GROUP_SIZE), end));
  }
  return groups.join(',');
}

/** Splits |minor| into its whole and fraction digit strings using string slicing only. */
function absoluteParts(minor: Minor): { whole: string; fraction: string } {
  const digits = Math.abs(toMinor(minor)).toString().padStart(MINOR_DIGITS + 1, '0');
  return { whole: digits.slice(0, -MINOR_DIGITS), fraction: digits.slice(-MINOR_DIGITS) };
}

function signPrefix(minor: Minor, sign: SignDisplay): string {
  if (sign === 'never' || minor === 0) return '';
  if (minor < 0) return '-';
  return sign === 'always' ? '+' : '';
}

/**
 * Splits an amount for typographic rendering: sign, grouped whole part and the two-digit fraction.
 * `175000 -> { sign: '', whole: '1,750', fraction: '00' }`.
 */
export function splitMinor(minor: Minor): { sign: '' | '-'; whole: string; fraction: string } {
  const { whole, fraction } = absoluteParts(minor);
  return { sign: minor < 0 ? '-' : '', whole: groupThousands(whole), fraction };
}

/**
 * Formats minor units as a decimal string without a currency: `175000 -> "1,750.00"`,
 * `-2500 -> "-25.00"`. `grouping` (default true) adds thousands commas; `sign` controls the sign:
 * `auto` shows "-" only, `always` also shows "+" for positives, `never` shows the absolute value.
 */
export function formatMinor(minor: Minor, opts: { grouping?: boolean; sign?: SignDisplay } = {}): string {
  const { grouping = true, sign = 'auto' } = opts;
  const { whole, fraction } = absoluteParts(minor);
  return `${signPrefix(minor, sign)}${grouping ? groupThousands(whole) : whole}.${fraction}`;
}

/** Formats an amount code-prefixed so it is unambiguous everywhere: "CAD 1,750.00", "-CAD 25.00". */
export function formatMoney(minor: Minor, currency: Currency, opts: { sign?: SignDisplay } = {}): string {
  const { sign = 'auto' } = opts;
  return `${signPrefix(minor, sign)}${currency} ${formatMinor(minor, { sign: 'never' })}`;
}

/** Plain machine-readable decimal for exports: "1750.00", "-25.00" (no grouping, no currency). */
export function minorToDecimalString(minor: Minor): string {
  return formatMinor(minor, { grouping: false, sign: 'auto' });
}

/** True when `minor` is a valid single amount: an integer in [MIN_AMOUNT_MINOR, MAX_AMOUNT_MINOR]. */
export function isValidAmountMinor(minor: number): minor is Minor {
  return Number.isSafeInteger(minor) && minor >= MIN_AMOUNT_MINOR && minor <= MAX_AMOUNT_MINOR;
}
