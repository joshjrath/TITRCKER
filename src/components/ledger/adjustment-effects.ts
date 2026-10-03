import {
  AMOUNT_ERROR_MESSAGES,
  ROUNDING_POLICY,
  addMinor,
  computeTithe,
  formatMoney,
  parseAmount,
  subMinor,
  type Minor,
} from "@/domain";
import type { AdjustmentVM, IncomeRowVM } from "@/lib/view-models";

type RowFacts = Pick<
  IncomeRowVM,
  "currency" | "amountMinor" | "titheMinor" | "titheRateBps" | "netAmountMinor" | "netTitheMinor" | "refundableMinor" | "refundedMinor"
>;

export type RefundPreview =
  | { status: "empty" }
  | { status: "invalid"; message: string }
  | { status: "too_much"; message: string }
  | {
      status: "ok";
      amountMinor: Minor;
      /** Change to the entry's tithe (<= 0): tithe(net after) − tithe(net before). */
      titheChangeMinor: Minor;
      netAmountAfterMinor: Minor;
      netTitheAfterMinor: Minor;
    };

function titheOf(row: RowFacts, amountMinor: Minor): Minor {
  return computeTithe(amountMinor, row.titheRateBps, ROUNDING_POLICY);
}

/** Message shown when nothing (or less than asked) is left to refund on an entry. */
export function refundLimitMessage(row: RowFacts): string {
  return row.refundableMinor <= 0
    ? "This entry has already been fully refunded."
    : `You can refund at most ${formatMoney(row.refundableMinor, row.currency)} on this entry.`;
}

/**
 * What a new refund/correction of the typed amount would do to the entry. The entry's tithe is always
 * tithe(received − all refunds), so the change is the same whatever order the refunds are dated in.
 */
export function refundPreview(row: RowFacts, amountText: string): RefundPreview {
  if (amountText.trim() === "") return { status: "empty" };
  const parsed = parseAmount(amountText);
  if (!parsed.ok) return { status: "invalid", message: AMOUNT_ERROR_MESSAGES[parsed.error] };
  if (parsed.minor > row.refundableMinor) return { status: "too_much", message: refundLimitMessage(row) };
  const netAmountAfterMinor = subMinor(row.netAmountMinor, parsed.minor);
  const netTitheAfterMinor = titheOf(row, netAmountAfterMinor);
  return {
    status: "ok",
    amountMinor: parsed.minor,
    titheChangeMinor: subMinor(netTitheAfterMinor, row.netTitheMinor),
    netAmountAfterMinor,
    netTitheAfterMinor,
  };
}

/** What removing one adjustment does: the entry's tithe goes back up by `titheChangeMinor` (>= 0). */
export function adjustmentRemovalEffect(
  row: RowFacts,
  adjustment: Pick<AdjustmentVM, "amountMinor">,
): { titheChangeMinor: Minor; netTitheAfterMinor: Minor } {
  const netTitheAfterMinor = titheOf(row, addMinor(row.netAmountMinor, adjustment.amountMinor));
  return { titheChangeMinor: subMinor(netTitheAfterMinor, row.netTitheMinor), netTitheAfterMinor };
}

/** The confirmation sentence for deleting an income entry, e.g. "This removes CAD 1,750.00 income and …". */
export function deleteEffectText(row: RowFacts): string {
  const income = formatMoney(row.netAmountMinor, row.currency);
  const tithe = formatMoney(row.netTitheMinor, row.currency);
  const afterRefunds = row.refundedMinor > 0 ? " (after its refunds)" : "";
  return `This removes ${income} income and ${tithe} tithe${afterRefunds} from your totals. It stays in your audit history.`;
}

/** "Refunded CAD 50.00 · net tithe CAD 20.00". */
export function netSummaryText(row: RowFacts): string {
  return `Refunded ${formatMoney(row.refundedMinor, row.currency)} · net tithe ${formatMoney(row.netTitheMinor, row.currency)}`;
}
