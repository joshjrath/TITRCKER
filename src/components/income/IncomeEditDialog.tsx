"use client";

import { useRef } from "react";
import { formatLocalDate, formatMoney } from "@/domain";
import { useIncomeEntry } from "@/components/app/IncomeEntryProvider";
import { Dialog } from "@/components/ui";
import type { IncomeMutationResult, IncomeRowVM } from "@/lib/view-models";
import { IncomeForm } from "./IncomeForm";

export interface IncomeEditDialogProps {
  /** The entry to edit; null keeps the dialog closed. */
  income: IncomeRowVM | null;
  onClose: () => void;
  /** Optional extra handling after a confirmed save (the toast and row highlight are handled already). */
  onSaved?: (result: IncomeMutationResult) => void;
}

const DISCARD_PROMPT = "Discard your changes to this entry?";

/** Edit an income entry in a dialog (optimistic concurrency via the entry's version). */
export function IncomeEditDialog({ income, onClose, onSaved }: IncomeEditDialogProps) {
  const { defaults, reportSaved } = useIncomeEntry();
  const dirtyRef = useRef(false);
  return (
    <Dialog
      open={income !== null}
      onClose={() => {
        dirtyRef.current = false;
        onClose();
      }}
      onRequestClose={() => !dirtyRef.current || window.confirm(DISCARD_PROMPT)}
      title="Edit income"
      description={
        income
          ? `${formatMoney(income.amountMinor, income.currency)} received ${formatLocalDate(income.receivedOn)}`
          : undefined
      }
    >
      {income ? (
        <IncomeForm
          key={`${income.id}:${income.version}`}
          mode="edit"
          initial={income}
          defaults={defaults}
          onDirtyChange={(dirty) => {
            dirtyRef.current = dirty;
          }}
          onSaved={(result) => {
            dirtyRef.current = false;
            reportSaved(result, "edit");
            onSaved?.(result);
            onClose();
          }}
        />
      ) : null}
    </Dialog>
  );
}
