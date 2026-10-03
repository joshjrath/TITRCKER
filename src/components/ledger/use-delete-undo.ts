"use client";

import { useCallback } from "react";
import { formatMoney } from "@/domain";
import { useToast } from "@/components/ui";
import type { IncomeRowVM } from "@/lib/view-models";
import { restoreIncomeAction } from "@/server/actions/income";

/**
 * After a confirmed delete: a toast that says what left the totals, with an "Undo" action that restores the
 * entry (one idempotency key per toast, so a repeated click cannot restore twice).
 */
export function useDeleteUndo(onRestored: (row: IncomeRowVM) => void): (row: IncomeRowVM) => void {
  const { toast } = useToast();
  return useCallback(
    (row: IncomeRowVM) => {
      const idempotencyKey = crypto.randomUUID();
      const tithe = formatMoney(row.netTitheMinor, row.currency);
      const restore = async () => {
        let message = "We couldn't confirm the undo. Check your connection; the entry may still be deleted.";
        try {
          const result = await restoreIncomeAction({ idempotencyKey, id: row.id });
          if (result.ok) {
            toast({ title: `Restored · ${tithe} tithe is back in your totals` });
            onRestored(row);
            return;
          }
          message = result.message;
        } catch {
          // Network failure: keep the default message.
        }
        toast({ title: "Undo didn't go through", description: message, variant: "error" });
      };
      toast({
        title: `Income deleted · ${tithe} tithe removed from your totals`,
        description: `${formatMoney(row.netAmountMinor, row.currency)}${row.source ? ` from ${row.source}` : ""}. It stays in your audit history.`,
        action: { label: "Undo", onAction: () => void restore() },
      });
    },
    [toast, onRestored],
  );
}
