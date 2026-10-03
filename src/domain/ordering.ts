/**
 * Deterministic, locale-independent ordering helpers shared by every module that sorts records.
 * Canonical record order is (date, createdAt, id): two records never compare equal unless they are
 * the same record, so every derived list is reproducible.
 */

/** Plain code-unit string comparison (locale independent, deterministic). */
export function compareStrings(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** Compares ISO timestamps chronologically, falling back to string order for unparsable input. */
export function compareTimestamps(a: string, b: string): number {
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (!Number.isNaN(ta) && !Number.isNaN(tb) && ta !== tb) return ta < tb ? -1 : 1;
  return compareStrings(a, b);
}

/** Canonical record order: local date, then createdAt (chronological), then id. */
export function compareByDateCreatedId(
  a: { date: string; createdAt: string; id: string },
  b: { date: string; createdAt: string; id: string },
): number {
  return compareStrings(a.date, b.date) || compareTimestamps(a.createdAt, b.createdAt) || compareStrings(a.id, b.id);
}
