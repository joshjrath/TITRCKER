/**
 * Display-only currency conversion: the combined "Total still to give in CAD", and the combined CAD view of the
 * Overview's period figures and the Ledger's filtered totals.
 *
 * Policy (owner request, ARCHITECTURE §3.10):
 * - CAD and USD ledgers stay independent. Nothing converted is ever stored, allocated or exported.
 * - Per-currency amounts are converted and summed only for display. Credits are never netted across currencies.
 * - Conversion is exact: the decimal rate is parsed into an integer and a scale, multiplied with BigInt and rounded
 *   half-up to the cent (symmetric for negative amounts).
 */
import type { Currency } from './constants';
import type { LocalDate } from './dates';
import { addMinor, type Minor, toMinor } from './money';

/** Sanity bounds for a USD→CAD rate. Anything outside is treated as a bad payload, not a real market move. */
export const FX_RATE_MIN = '0.5';
export const FX_RATE_MAX = '3.0';
/** Most decimal places accepted in a published rate (the Bank of Canada publishes 4). */
export const FX_RATE_MAX_DECIMALS = 8;

export type FxSource = 'bank_of_canada' | 'ecb_frankfurter' | 'test_fixture';

export const FX_SOURCE_LABELS: Record<FxSource, string> = {
  bank_of_canada: 'Bank of Canada',
  ecb_frankfurter: 'European Central Bank (via Frankfurter)',
  test_fixture: 'Test rate',
};

/** A USD→CAD rate: how many CAD one USD buys on `observedOn`. */
export interface FxRate {
  base: 'USD';
  quote: 'CAD';
  /** Decimal string such as "1.3712". */
  rate: string;
  observedOn: LocalDate;
  source: FxSource;
  /** ISO timestamp of when the server fetched it. */
  fetchedAt: string;
  /** True when the newest available rate is older than expected (e.g. the providers were unreachable). */
  stale: boolean;
}

const RATE_SHAPE = new RegExp(`^(\\d{1,2})\\.(\\d{1,${FX_RATE_MAX_DECIMALS}})$`);

interface ParsedRate {
  units: bigint;
  scale: number;
}

function parseShape(text: string): ParsedRate | null {
  const match = RATE_SHAPE.exec(text);
  if (!match) return null;
  const [, whole = '', fraction = ''] = match;
  return { units: BigInt(whole + fraction), scale: fraction.length };
}

/** Compares two parsed rates exactly (cross-multiplying to a common scale). */
function compareRates(a: ParsedRate, b: ParsedRate): -1 | 0 | 1 {
  const left = a.units * 10n ** BigInt(b.scale);
  const right = b.units * 10n ** BigInt(a.scale);
  return left < right ? -1 : left > right ? 1 : 0;
}

const MIN_RATE = parseShape(FX_RATE_MIN)!;
const MAX_RATE = parseShape(FX_RATE_MAX)!;

/**
 * Strictly parses a decimal rate ("1.3712"). Rejects signs, exponents, whitespace, missing decimals, more than
 * {@link FX_RATE_MAX_DECIMALS} decimals and values outside [{@link FX_RATE_MIN}, {@link FX_RATE_MAX}].
 */
export function parseFxRate(text: string): ParsedRate | null {
  const parsed = parseShape(text);
  if (!parsed) return null;
  if (compareRates(parsed, MIN_RATE) < 0 || compareRates(parsed, MAX_RATE) > 0) return null;
  return parsed;
}

/**
 * Converts a USD amount in cents to CAD cents at `rate`, rounding half-up to the cent
 * (away from zero for negative amounts, so conversion is symmetric).
 * USD 0.02 at 1.3750 = 0.0275 → CAD 0.03; USD 100.00 at 1.3500 → CAD 135.00.
 */
export function convertUsdToCadMinor(usdMinor: Minor, rate: string): Minor {
  const parsed = parseFxRate(rate);
  if (!parsed) throw new RangeError(`Invalid USD→CAD rate: ${JSON.stringify(rate)}`);
  const amount = BigInt(toMinor(usdMinor));
  const magnitude = amount < 0n ? -amount : amount;
  const divisor = 10n ** BigInt(parsed.scale);
  const rounded = (magnitude * parsed.units * 2n + divisor) / (2n * divisor);
  return toMinor(Number(amount < 0n ? -rounded : rounded));
}

/** Several per-currency amounts expressed in CAD (display-only). */
export interface AmountsInCad {
  /** CAD amount plus the USD amount converted to CAD. */
  totalCadMinor: Minor;
  cadMinor: Minor;
  usdMinor: Minor;
  /** The USD amount converted to CAD (0 when there is no USD). */
  usdInCadMinor: Minor;
}

/**
 * Expresses per-currency amounts in CAD: CAD as is, plus USD converted at `rate` (a decimal USD→CAD string), rounded
 * half-up to the cent. Works for any sign (e.g. a period whose refunds exceed its income). Returns null when there is
 * USD to convert but no rate, so callers never show a guessed number. With no USD, no rate is needed.
 * Example: CAD 5,203.00 + USD 1,750.00 at 1.4145 (2,475.375 → 2,475.38) = CAD 7,678.38.
 */
export function combineAmountsInCad(amounts: Record<Currency, Minor>, rate: string | null): AmountsInCad | null {
  const cadMinor = amounts.CAD;
  const usdMinor = amounts.USD;
  if (usdMinor === 0) return { totalCadMinor: cadMinor, cadMinor, usdMinor, usdInCadMinor: toMinor(0) };
  if (rate === null) return null;
  const usdInCadMinor = convertUsdToCadMinor(usdMinor, rate);
  return { totalCadMinor: addMinor(cadMinor, usdInCadMinor), cadMinor, usdMinor, usdInCadMinor };
}

/** The combined figure shown at the top of the Overview. */
export interface CombinedTotal extends AmountsInCad {
  /** Null only when there was no USD to convert. */
  rate: FxRate | null;
}

/**
 * Sums still-to-give across currencies in CAD. Returns null when USD is owed but no rate is available, so callers
 * must fall back to showing the currencies separately. Inputs are per-currency still-to-give (never negative).
 */
export function combineStillToGiveInCad(stillToGive: Record<Currency, Minor>, rate: FxRate | null): CombinedTotal | null {
  const combined = combineAmountsInCad(stillToGive, rate?.rate ?? null);
  return combined ? { ...combined, rate } : null;
}
