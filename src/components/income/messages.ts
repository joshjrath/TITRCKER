import { formatMoney } from "@/domain";
import type { IncomeMutationResult } from "@/lib/view-models";

/** Toast text after a confirmed save, e.g. "Saved · CAD 175.00 added to your tithe". */
export function incomeSavedMessage(result: IncomeMutationResult, mode: "create" | "edit"): { title: string; description: string } {
  const tithe = formatMoney(result.titheMinor, result.currency);
  const received = formatMoney(result.amountMinor, result.currency);
  if (mode === "edit") {
    return { title: `Updated · this entry's tithe is now ${tithe}`, description: `${received} received.` };
  }
  return { title: `Saved · ${tithe} added to your tithe`, description: `${received} received.` };
}
