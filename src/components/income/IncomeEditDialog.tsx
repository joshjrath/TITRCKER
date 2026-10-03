"use client";

import { useId, useRef, useState } from "react";
import { formatLocalDate, formatMoney } from "@/domain";
import { useIncomeEntry } from "@/components/app/IncomeEntryProvider";
import { Button, Sheet } from "@/components/ui";
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

/**
 * Edit an income entry (optimistic concurrency via the entry's version): a centered dialog on larger screens, a
 * full-screen form with Save in the title bar on phones.
 */
export function IncomeEditDialog({ income, onClose, onSaved }: IncomeEditDialogProps) {
  const { defaults, reportSaved } = useIncomeEntry();
  const formElementId = useId();
  const [saving, setSaving] = useState(false);
  const dirtyRef = useRef(false);
  return (
    <Sheet
      open={income !== null}
      onClose={() => {
        dirtyRef.current = false;
        onClose();
      }}
      onRequestClose={() => !saving && (!dirtyRef.current || window.confirm(DISCARD_PROMPT))}
      title="Edit income"
      description={
        income
          ? `${formatMoney(income.amountMinor, income.currency)} received ${formatLocalDate(income.receivedOn)}`
          : undefined
      }
      phoneAction={
        <Button type="submit" form={formElementId} size="sm" loading={saving} loadingLabel="Saving…">
          Save
        </Button>
      }
    >
      {income ? (
        <IncomeForm
          key={`${income.id}:${income.version}`}
          id={formElementId}
          mode="edit"
          initial={income}
          defaults={defaults}
          onPendingChange={setSaving}
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
    </Sheet>
  );
}
