/** A currency code followed by a space and an amount (optionally signed), as `formatMoney` writes it. */
const CODE_THEN_AMOUNT = /\b(CAD|USD) (?=[−+-]?\d)/g;

/**
 * Joins each currency code to its amount with a no-break space, so a sentence that wraps never leaves "CAD" at the end
 * of one line and "1,363.59" at the start of the next. Display-only: exports and stored text keep plain spaces.
 */
export function keepMoneyTogether(text: string): string {
  return text.replace(CODE_THEN_AMOUNT, "$1 ");
}
