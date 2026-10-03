/**
 * Domain constants: every money limit, rate, policy name and calendar number used by the domain layer.
 *
 * Nothing outside this file may hard-code these values (ARCHITECTURE §2 "no magic numbers").
 */

/** Supported currencies. CAD and USD ledgers are fully independent and never added together. */
export const CURRENCIES = ['CAD', 'USD'] as const;
export type Currency = (typeof CURRENCIES)[number];

/** Currency used when nothing else is known (new accounts, first entry). */
export const DEFAULT_CURRENCY: Currency = 'CAD';

/** Number of minor-unit digits for every supported currency (cents). */
export const MINOR_DIGITS = 2;

/** Minor units in one major unit (100 cents per dollar), derived from {@link MINOR_DIGITS}. */
export const MINOR_PER_MAJOR = 10 ** MINOR_DIGITS;

/** Smallest single amount: 0.01. */
export const MIN_AMOUNT_MINOR = 1;

/** Largest single amount: 999,999,999.99 (ARCHITECTURE §3.1 safe limit). */
export const MAX_AMOUNT_MINOR = 99_999_999_999;

/** The fixed tithe rate in basis points: 1000 bps = 10.00%. */
export const TITHE_RATE_BPS = 1000;

/** Basis points in 100%. */
export const BPS_DENOMINATOR = 10_000;

/** Half of {@link BPS_DENOMINATOR}; added before the integer division to round half up. */
export const HALF_UP_OFFSET_BPS = BPS_DENOMINATOR / 2;

/** The only rounding policy: round each income entry's tithe to the nearest cent, half up. */
export const ROUNDING_POLICY = 'HALF_UP_PER_ENTRY_MINOR' as const;
export type RoundingPolicy = typeof ROUNDING_POLICY;

/** Digits per thousands group when formatting / parsing grouped amounts ("1,750"). */
export const THOUSANDS_GROUP_SIZE = 3;

/** Default IANA time zone that defines "today", year boundaries and countdowns. */
export const DEFAULT_TIME_ZONE = 'America/Toronto';

/** Default tracking start: the original brief date. */
export const DEFAULT_TRACKING_START = '2026-10-03';

/** Default next payout date. */
export const DEFAULT_PAYOUT_DATE = '2026-12-31';

/** Supported calendar-year range for any financial date. */
export const MIN_SUPPORTED_YEAR = 2000;
export const MAX_SUPPORTED_YEAR = 2200;

/** Calendar constants used by pure epoch-day arithmetic. */
export const MS_PER_DAY = 86_400_000;
export const DAYS_PER_WEEK = 7;
export const MONTHS_PER_YEAR = 12;
/** Weekday of 1970-01-01 (0 = Sunday ... 6 = Saturday): a Thursday. */
export const EPOCH_WEEKDAY = 4;
/** First and last month / day numbers of a calendar year. */
export const FIRST_MONTH = 1;
export const LAST_MONTH = 12;
export const LAST_DAY_OF_DECEMBER = 31;

/** Presentation metadata for each currency. Amounts are always shown code-prefixed ("CAD 1,750.00"). */
export const CURRENCY_META: Record<Currency, { code: Currency; name: string; symbol: '$'; locale: string }> = {
  CAD: { code: 'CAD', name: 'Canadian dollar', symbol: '$', locale: 'en-CA' },
  USD: { code: 'USD', name: 'US dollar', symbol: '$', locale: 'en-US' },
};

/** Type guard for a supported currency code (exact, case-sensitive). */
export function isCurrency(value: unknown): value is Currency {
  return typeof value === 'string' && (CURRENCIES as readonly string[]).includes(value);
}
