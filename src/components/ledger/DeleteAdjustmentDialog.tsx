"use client";

import { useId, useState } from "react";
import { formatLocalDate, formatMoney } from "@/domain";
import { Button, Dialog, Field, InlineAlert, TextInput, useToast } from "@/components/ui";
import { TEXT_LIMITS } from "@/lib/validation";
import type { AdjustmentVM, IncomeRowVM } from "@/lib/view-models";
import { deleteAdjustmentAction } from "@/server/actions/income";
import { adjustmentRemovalEffect } from "./adjustment-effects";
import { CONNECTION_PROBLEM, useIdempotencyKey, useLeaveGuard, useSubmitLock } from "./use-form-session";

export interface DeleteAdjustmentDialogProps {
  row: IncomeRowVM;
  adjustment: AdjustmentVM;
  open: boolean;
  onClose: () => void;
  onRemoved: (row: IncomeRowVM) => void;
}

/** Confirms removing a refund/correction and says how much tithe comes back. */
export function DeleteAdjustmentDialog({ row, adjustment, open, onClose, onRemoved }: DeleteAdjustmentDialogProps) {
  const formId = useId();
  const { toast } = useToast();
  const [idempotencyKey, renewKey] = useIdempotencyKey();
  const [pending, run] = useSubmitLock();
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState<{ message: string; reason?: string } | null>(null);
  const guard = useLeaveGuard(open && reason.trim() !== "", pending, "Close without removing it? Your reason will be lost.");
  const noun = adjustment.kind === "refund" ? "refund" : "correction";
  const effect = adjustmentRemovalEffect(row, adjustment);
  const back = formatMoney(effect.titheChangeMinor, row.currency);

  async function submit() {
    const trimmed = reason.trim();
    const result = await run(() =>
      deleteAdjustmentAction({ idempotencyKey, id: adjustment.id, reason: trimmed === "" ? undefined : trimmed }),
    );
    if (result === undefined) return;
    if (result === null) {
      setProblem({ message: CONNECTION_PROBLEM });
      return;
    }
    if (!result.ok) {
      setProblem({ message: result.message, reason: result.fieldErrors?.reason });
      return;
    }
    renewKey();
    toast({
      title: `${noun === "refund" ? "Refund" : "Correction"} removed · this entry's tithe is back to ${formatMoney(effect.netTitheAfterMinor, row.currency)}`,
    });
    onRemoved(row);
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      onRequestClose={guard}
      size="sm"
      title={`Remove this ${noun}?`}
      description={`${formatMoney(adjustment.amountMinor, row.currency)} on ${formatLocalDate(adjustment.effectiveOn)} · “${adjustment.reason}”`}
      footer={
        <>
          <Button variant="ghost" onClick={() => guard() && onClose()} disabled={pending}>
            Keep {noun}
          </Button>
          <Button type="submit" form={formId} variant="danger" loading={pending} loadingLabel="Removing…">
            Remove {noun}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        noValidate
        aria-busy={pending || undefined}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="flex flex-col gap-4"
      >
        <p className="text-[0.9375rem] text-text">
          {effect.titheChangeMinor > 0
            ? `This adds ${back} back to this entry's tithe (${formatMoney(row.netTitheMinor, row.currency)} → ${formatMoney(effect.netTitheAfterMinor, row.currency)}), so what you still have to give in ${row.currency} goes up.`
            : `This entry's tithe stays ${formatMoney(row.netTitheMinor, row.currency)}.`}{" "}
          It stays in your audit history.
        </p>
        <Field label="Reason" showOptional error={problem?.reason}>
          <TextInput value={reason} maxLength={TEXT_LIMITS.reason} placeholder="e.g. Recorded by mistake" onChange={(e) => setReason(e.target.value)} />
        </Field>
        {problem ? (
          <InlineAlert tone="danger" live="alert">
            {problem.message}
          </InlineAlert>
        ) : null}
      </form>
    </Dialog>
  );
}
