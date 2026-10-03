"use client";

import { useId, useState } from "react";
import { formatLocalDate, formatMoney } from "@/domain";
import { Button, Dialog, Field, InlineAlert, TextInput } from "@/components/ui";
import { TEXT_LIMITS } from "@/lib/validation";
import type { IncomeRowVM } from "@/lib/view-models";
import { deleteIncomeAction } from "@/server/actions/income";
import { deleteEffectText } from "./adjustment-effects";
import { CONNECTION_PROBLEM, useIdempotencyKey, useLeaveGuard, useSubmitLock } from "./use-form-session";

export interface DeleteIncomeDialogProps {
  row: IncomeRowVM;
  open: boolean;
  onClose: () => void;
  /** After a confirmed delete (offer Undo there). */
  onDeleted: (row: IncomeRowVM) => void;
}

/** Confirms deleting an income entry, stating exactly what leaves the totals. Optional reason for the audit history. */
export function DeleteIncomeDialog({ row, open, onClose, onDeleted }: DeleteIncomeDialogProps) {
  const formId = useId();
  const [idempotencyKey, renewKey] = useIdempotencyKey();
  const [pending, run] = useSubmitLock();
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState<{ message: string; reason?: string } | null>(null);
  const guard = useLeaveGuard(open && reason.trim() !== "", pending, "Close without deleting? Your reason will be lost.");

  async function submit() {
    const trimmed = reason.trim();
    const result = await run(() => deleteIncomeAction({ idempotencyKey, id: row.id, reason: trimmed === "" ? undefined : trimmed }));
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
    onDeleted(row);
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      onRequestClose={guard}
      size="sm"
      title="Delete this income?"
      description={`${formatMoney(row.amountMinor, row.currency)}${row.source ? ` from ${row.source}` : ""}, received ${formatLocalDate(row.receivedOn)}.`}
      footer={
        <>
          <Button variant="ghost" onClick={() => guard() && onClose()} disabled={pending}>
            Keep entry
          </Button>
          <Button type="submit" form={formId} variant="danger" loading={pending} loadingLabel="Deleting…">
            Delete entry
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
        <p className="text-[0.9375rem] text-text">{deleteEffectText(row)}</p>
        {row.adjustments.length > 0 ? (
          <p className="text-label text-text-2">
            Its {row.adjustments.length === 1 ? "refund goes" : `${row.adjustments.length} refunds go`} with it. Undo brings everything
            back.
          </p>
        ) : null}
        <Field label="Reason" showOptional error={problem?.reason}>
          <TextInput
            value={reason}
            maxLength={TEXT_LIMITS.reason}
            placeholder="e.g. Entered twice"
            onChange={(e) => setReason(e.target.value)}
          />
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
