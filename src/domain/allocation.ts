/**
 * Payment allocation (ARCHITECTURE §3.6).
 *
 * Every church payment stores explicit allocations `(bucketYear, amount)` in its own currency.
 * The default proposal pays the oldest outstanding bucket first, where "outstanding" is measured
 * after credits. Each allocation must be <= that bucket's outstanding amount at save time and the
 * allocations together must be <= the payment. Whatever is left is unallocated credit.
 */
import { addMinor, minMinor, subMinor, ZERO, type Minor } from './money';
import type { BucketPosition } from './balances';

export interface AllocationLine {
  bucketYear: number;
  amountMinor: Minor;
}

export interface ProposedAllocation {
  allocations: AllocationLine[];
  /** Payment amount left unallocated (becomes credit; requires explicit confirmation). */
  creditMinor: Minor;
}

/**
 * Proposes an allocation for a payment of `amountMinor`: fills buckets with outstanding > 0 in
 * ascending year order until the payment is used up; the remainder is credit.
 * `buckets` must be the current positions of the payment's currency.
 * @throws RangeError for a negative or non-integer amount (it would propose negative credit).
 */
export function proposeAllocation(amountMinor: Minor, buckets: readonly BucketPosition[]): ProposedAllocation {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) {
    throw new RangeError(`Payment amount must be a non-negative integer, got ${String(amountMinor)}`);
  }
  const allocations: AllocationLine[] = [];
  let remaining = amountMinor;
  const oldestFirst = [...buckets].sort((a, b) => a.year - b.year);
  for (const bucket of oldestFirst) {
    if (remaining <= 0) break;
    if (bucket.outstandingMinor <= 0) continue;
    const take = minMinor(remaining, bucket.outstandingMinor);
    allocations.push({ bucketYear: bucket.year, amountMinor: take });
    remaining = subMinor(remaining, take);
  }
  return { allocations, creditMinor: remaining };
}

export type AllocationError =
  | 'unknown_bucket'
  | 'exceeds_bucket_outstanding'
  | 'exceeds_payment'
  | 'duplicate_bucket'
  | 'non_positive';

export type AllocationValidation =
  | { ok: true; creditMinor: Minor }
  | { ok: false; error: AllocationError; bucketYear?: number };

/** Human-readable messages for allocation errors. */
export const ALLOCATION_ERROR_MESSAGES: Record<AllocationError, string> = {
  unknown_bucket: 'That period has nothing outstanding in this currency.',
  exceeds_bucket_outstanding: 'An allocation is larger than what is outstanding for that period.',
  exceeds_payment: 'The allocations add up to more than the payment.',
  duplicate_bucket: 'Each period can appear only once in a payment.',
  non_positive: 'Each allocation must be greater than 0.00 and the payment must be positive.',
};

/**
 * Validates a user-edited allocation against current bucket positions (same currency).
 * Checks, in order: positive payment and lines, no duplicate years, known buckets, each line within
 * its bucket's outstanding amount, total within the payment. On success returns the credit remainder.
 */
export function validateAllocation(
  amountMinor: Minor,
  allocations: readonly AllocationLine[],
  buckets: readonly BucketPosition[],
): AllocationValidation {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) return { ok: false, error: 'non_positive' };
  const seen = new Set<number>();
  for (const line of allocations) {
    if (!Number.isSafeInteger(line.amountMinor) || line.amountMinor <= 0) {
      return { ok: false, error: 'non_positive', bucketYear: line.bucketYear };
    }
    if (seen.has(line.bucketYear)) return { ok: false, error: 'duplicate_bucket', bucketYear: line.bucketYear };
    seen.add(line.bucketYear);
  }
  let total = ZERO;
  for (const line of allocations) {
    const bucket = buckets.find((b) => b.year === line.bucketYear);
    if (!bucket) return { ok: false, error: 'unknown_bucket', bucketYear: line.bucketYear };
    if (line.amountMinor > bucket.outstandingMinor) {
      return { ok: false, error: 'exceeds_bucket_outstanding', bucketYear: line.bucketYear };
    }
    total = addMinor(total, line.amountMinor);
  }
  if (total > amountMinor) return { ok: false, error: 'exceeds_payment' };
  return { ok: true, creditMinor: subMinor(amountMinor, total) };
}
