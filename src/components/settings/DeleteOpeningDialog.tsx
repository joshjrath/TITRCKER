"use client";

import { useState, useTransition } from "react";

import { formatLocalDate, formatMoney } from "@/domain";
import { useIdempotencyKey } from "@/components/given/form-session";
import { Button, Dialog, InlineAlert, useToast } from "@/components/ui";
import type { OpeningVM } from "@/lib/view-models";
import { deleteOpeningObligationAction } from "@/server/actions/opening";

export interface DeleteOpeningDialogProps {
  opening: OpeningVM;
  open: boolean;
  onClose: () => void;
}

/** Confirms removing an opening balance (soft delete, kept in the audit history). */
export function DeleteOpeningDialog({ opening, open, onClose }: DeleteOpeningDialogProps) {
  const { toast } = useToast();
  const [idempotencyKey, renewKey] = useIdempotencyKey();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const amount = formatMoney(opening.amountMinor, opening.currency);

  const confirm = () => {
    if (pending) return;
    startTransition(async () => {
      const result = await deleteOpeningObligationAction({ idempotencyKey, id: opening.id });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      renewKey();
      toast({ title: "Opening balance removed", description: `${opening.label} · ${amount}` });
      onClose();
    });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      onRequestClose={() => !pending}
      size="sm"
      title="Remove this opening balance?"
      description={`${opening.label} · ${amount} · owed as of ${formatLocalDate(opening.effectiveOn)}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Keep it
          </Button>
          <Button variant="danger" onClick={confirm} loading={pending} loadingLabel="Removing…">
            Remove
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-[0.875rem] text-text-2">
        <p>
          {amount} will no longer be added to what you owe in {opening.currency}. Payments you already recorded stay as they
          are; anything they covered beyond what you owe shows as credit.
        </p>
        {error ? (
          <InlineAlert tone="danger" live="alert">
            {error}
          </InlineAlert>
        ) : null}
      </div>
    </Dialog>
  );
}
