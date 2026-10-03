/**
 * Tithe computation and refund (adjustment) deltas.
 *
 * Policy (ARCHITECTURE §3.3–3.4):
 * - The tithe is rounded per income entry to the nearest cent, half up:
 *   `tithe = floor((amount_minor * rate_bps + 5000) / 10000)`, computed with BigInt.
 * - Adjustments on one entry are processed in canonical order (effectiveOn, createdAt, id) and each
 *   carries `delta_k = tithe(A - R_1..k) - tithe(A - R_1..k-1)` (always <= 0). The deltas telescope,
 *   so the entry's net tithe is always `tithe(A - ΣR)` and a full refund reverses exactly the
 *   original tithe. Deltas are derived on read and never stored.
 */
import {
  BPS_DENOMINATOR,
  HALF_UP_OFFSET_BPS,
  ROUNDING_POLICY,
  TITHE_RATE_BPS,
  type RoundingPolicy,
} from './constants';
import type { LocalDate } from './dates';
import { compareByDateCreatedId } from './ordering';
import { sumMinor, subMinor, toMinor, type Minor } from './money';

/**
 * The tithe on one amount: `floor((amount * rateBps + 5000) / 10000)` in BigInt (half up per entry).
 * CAD 1,750.00 -> 175.00; 249.99 -> 25.00; 0.05 -> 0.01; 0.01 -> 0.00.
 * @throws RangeError for a negative/non-integer amount, a negative/non-integer rate or an unknown policy.
 */
export function computeTithe(
  amountMinor: Minor,
  rateBps: number = TITHE_RATE_BPS,
  policy: RoundingPolicy = ROUNDING_POLICY,
): Minor {
  if (policy !== ROUNDING_POLICY) throw new RangeError(`Unknown rounding policy: ${String(policy)}`);
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) {
    throw new RangeError(`Tithe base must be a non-negative integer, got ${String(amountMinor)}`);
  }
  if (!Number.isSafeInteger(rateBps) || rateBps < 0 || rateBps > BPS_DENOMINATOR) {
    throw new RangeError(`Tithe rate must be an integer between 0 and ${BPS_DENOMINATOR} bps, got ${String(rateBps)}`);
  }
  // Both operands are non-negative, so BigInt truncating division is floor division.
  const tithe = (BigInt(amountMinor) * BigInt(rateBps) + BigInt(HALF_UP_OFFSET_BPS)) / BigInt(BPS_DENOMINATOR);
  return toMinor(Number(tithe));
}

/** The persisted tithe facts of one income entry. */
export interface TitheBasis {
  amountMinor: Minor;
  titheRateBps: number;
  roundingPolicy: RoundingPolicy;
  titheMinor: Minor;
}

/** The fields of an adjustment that determine its tithe delta and canonical order. */
export interface AdjustmentInput {
  id: string;
  amountMinor: Minor;
  effectiveOn: LocalDate;
  createdAt: string;
}

/** Returns a copy sorted in canonical adjustment order: effectiveOn, then createdAt, then id. */
export function sortAdjustments<T extends AdjustmentInput>(xs: readonly T[]): T[] {
  return [...xs].sort((a, b) =>
    compareByDateCreatedId(
      { date: a.effectiveOn, createdAt: a.createdAt, id: a.id },
      { date: b.effectiveOn, createdAt: b.createdAt, id: b.id },
    ),
  );
}

/**
 * Checks that the stored tithe matches the policy formula (the database enforces the same CHECK).
 * @throws RangeError when the stored tithe disagrees with the formula.
 */
export function assertTitheBasis(income: TitheBasis): void {
  const expected = computeTithe(income.amountMinor, income.titheRateBps, income.roundingPolicy);
  if (expected !== income.titheMinor) {
    throw new RangeError(`Stored tithe ${income.titheMinor} does not match policy result ${expected}`);
  }
}

/** Total adjustment amount on one entry. */
export function totalAdjusted(adjustments: readonly { amountMinor: Minor }[]): Minor {
  return sumMinor(adjustments.map((a) => a.amountMinor));
}

/**
 * Received amount still available to refund: `amount - Σ adjustments`.
 * @throws RangeError if the adjustments already exceed the amount (corrupt input).
 */
export function remainingRefundable(
  income: { amountMinor: Minor },
  adjustments: readonly { amountMinor: Minor }[],
): Minor {
  const remaining = subMinor(income.amountMinor, totalAdjusted(adjustments));
  if (remaining < 0) throw new RangeError('Adjustments exceed the received amount');
  return remaining;
}

export type RefundCheckError = 'non_positive' | 'exceeds_refundable';

/**
 * Validates a proposed new adjustment amount against the entry's remaining refundable amount.
 * Total active adjustments may never exceed the received amount.
 */
export function checkRefundAmount(
  income: { amountMinor: Minor },
  existing: readonly { amountMinor: Minor }[],
  amountMinor: Minor,
): { ok: true; remainingAfterMinor: Minor } | { ok: false; error: RefundCheckError; refundableMinor: Minor } {
  const refundable = remainingRefundable(income, existing);
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    return { ok: false, error: 'non_positive', refundableMinor: refundable };
  }
  if (amountMinor > refundable) return { ok: false, error: 'exceeds_refundable', refundableMinor: refundable };
  return { ok: true, remainingAfterMinor: subMinor(refundable, amountMinor) };
}

/**
 * Telescoping tithe deltas (each <= 0) for an entry's adjustments, keyed by adjustment id, computed
 * in canonical order: `delta_k = tithe(A - R_1..k) - tithe(A - R_1..k-1)`. The first step starts
 * from the stored tithe (validated against the formula).
 * @throws RangeError if any adjustment is non-positive, two share an id, or their total exceeds the received amount.
 */
export function adjustmentTitheDeltas(income: TitheBasis, adjustments: readonly AdjustmentInput[]): Map<string, Minor> {
  assertTitheBasis(income);
  const deltas = new Map<string, Minor>();
  let remainingAmount = income.amountMinor;
  let previousTithe = income.titheMinor;
  for (const adjustment of sortAdjustments(adjustments)) {
    if (!Number.isSafeInteger(adjustment.amountMinor) || adjustment.amountMinor <= 0) {
      throw new RangeError(`Adjustment ${adjustment.id} must be a positive amount`);
    }
    // Deltas are keyed by id; a repeated id would silently drop a step of the telescoping sum.
    if (deltas.has(adjustment.id)) throw new RangeError(`Duplicate adjustment id ${adjustment.id}`);
    remainingAmount = subMinor(remainingAmount, adjustment.amountMinor);
    if (remainingAmount < 0) throw new RangeError('Refund limit exceeded: adjustments exceed the received amount');
    const nextTithe = computeTithe(remainingAmount, income.titheRateBps, income.roundingPolicy);
    deltas.set(adjustment.id, subMinor(nextTithe, previousTithe));
    previousTithe = nextTithe;
  }
  return deltas;
}

/** The entry's net tithe after all adjustments: `tithe(A - ΣR)`. @throws like {@link adjustmentTitheDeltas}. */
export function netTithe(income: TitheBasis, adjustments: readonly AdjustmentInput[]): Minor {
  const deltas = adjustmentTitheDeltas(income, adjustments).values();
  return sumMinor([income.titheMinor, ...deltas]);
}

/** Builds the persisted tithe facts for a new income entry under the current fixed policy. */
export function titheBasisFor(amountMinor: Minor): TitheBasis {
  return {
    amountMinor,
    titheRateBps: TITHE_RATE_BPS,
    roundingPolicy: ROUNDING_POLICY,
    titheMinor: computeTithe(amountMinor),
  };
}
