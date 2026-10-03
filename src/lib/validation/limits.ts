/**
 * Maximum text lengths (in UTF-16 code units, which is never fewer than the code points Postgres counts),
 * shared by the zod schemas, the form inputs (maxLength) and the database CHECK constraints.
 * ARCHITECTURE §2: these are the only text-length numbers in the codebase.
 */
export const TEXT_LIMITS = {
  source: 120,
  category: 40,
  note: 500,
  churchName: 120,
  reference: 80,
  reason: 200,
  label: 80,
  timeZone: 64,
} as const;

export type TextLimitField = keyof typeof TEXT_LIMITS;

/** Default label for an opening obligation when none is given. */
export const DEFAULT_OPENING_LABEL = "Opening balance";
