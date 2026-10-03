import { formatMoney, type BucketPosition, type Currency } from "@/domain";

/**
 * Why an over-covered period counts as credit. Payments allocated beyond what the period finally owed are credit;
 * with nothing allocated, the period went below zero through refunds alone, so no payment is mentioned.
 */
export function overCoveredNote(bucket: Pick<BucketPosition, "year" | "allocatedMinor" | "overCoveredMinor">, currency: Currency): string {
  const amount = formatMoney(bucket.overCoveredMinor, currency);
  return bucket.allocatedMinor > 0
    ? `${bucket.year}: payments cover ${amount} more than this period finally owed (after refunds). That amount counts as credit.`
    : `${bucket.year}: refunds brought this period below zero — ${amount} counts as credit.`;
}
