"use client";

import { useId, useState } from "react";
import { formatLocalDate, formatMoney, type AdjustmentKind } from "@/domain";
import { AmountInput, Button, DateInput, Dialog, Field, InlineAlert, SegmentedControl, TextInput, useToast } from "@/components/ui";
import { TEXT_LIMITS, adjustmentCreateSchema, parseWith } from "@/lib/validation";
import type { IncomeRowVM } from "@/lib/view-models";
import { createAdjustmentAction } from "@/server/actions/income";
import { refundPreview } from "./adjustment-effects";
import { RefundPreviewLine } from "./RefundPreviewLine";
import { CONNECTION_PROBLEM, useIdempotencyKey, useLeaveGuard, useSubmitLock } from "./use-form-session";

export interface RefundDialogProps {
  row: IncomeRowVM;
  open: boolean;
  today: string;
  onClose: () => void;
  /** After a confirmed save (the toast is shown already). */
  onSaved: (row: IncomeRowVM) => void;
}

type RefundField = "kind" | "amount" | "effectiveOn" | "reason";
const FIELDS: readonly RefundField[] = ["kind", "amount", "effectiveOn", "reason"];

const CHECK_FIELDS = "Please check the highlighted fields.";

const KIND_OPTIONS: readonly { value: AdjustmentKind; label: string }[] = [
  { value: "refund", label: "Refund" },
  { value: "correction", label: "Correction" },
];

const KIND_HELP: Record<AdjustmentKind, string> = {
  refund: "Some of this money went back to the payer.",
  correction: "The entry was recorded higher than what you actually received.",
};

/**
 * Records a refund or correction against one income entry: amount (up to what is left to refund), effective date
 * (between the date received and today) and a required reason, with a live preview of the tithe change.
 */
export function RefundDialog({ row, open, today, onClose, onSaved }: RefundDialogProps) {
  const formId = useId();
  const previewId = `${formId}-preview`;
  const { toast } = useToast();
  const [idempotencyKey, renewKey] = useIdempotencyKey();
  const [pending, run] = useSubmitLock();
  const [kind, setKind] = useState<AdjustmentKind>("refund");
  const [amount, setAmount] = useState("");
  const [effectiveOn, setEffectiveOn] = useState(today);
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Partial<Record<RefundField, string>>>({});
  const [problem, setProblem] = useState<string | null>(null);

  const dirty = open && (amount.trim() !== "" || reason.trim() !== "" || effectiveOn !== today || kind !== "refund");
  const guard = useLeaveGuard(dirty, pending, "Discard this refund? Nothing has been saved.");
  const preview = refundPreview(row, amount);
  const noun = kind === "refund" ? "refund" : "correction";

  const clearError = (field: RefundField) => {
    const remaining = { ...errors, [field]: undefined };
    setErrors(remaining);
    // The form-level "check the fields" note goes once every flagged field has been edited.
    if (problem === CHECK_FIELDS && !Object.values(remaining).some(Boolean)) setProblem(null);
  };

  function localErrors(): Partial<Record<RefundField, string>> {
    const out: Partial<Record<RefundField, string>> = {};
    const check = parseWith(adjustmentCreateSchema, { idempotencyKey, incomeId: row.id, kind, amount, effectiveOn, reason });
    if (!check.ok) {
      for (const f of FIELDS) if (check.fieldErrors[f]) out[f] = check.fieldErrors[f];
    }
    if (!out.amount && preview.status === "too_much") out.amount = preview.message;
    if (!out.effectiveOn && effectiveOn < row.receivedOn) {
      out.effectiveOn = `The date can't be before the income was received (${formatLocalDate(row.receivedOn)}).`;
    }
    if (!out.effectiveOn && effectiveOn > today) out.effectiveOn = "The date can't be in the future.";
    return out;
  }

  async function submit() {
    const found = localErrors();
    if (Object.values(found).some(Boolean)) {
      setErrors(found);
      setProblem(CHECK_FIELDS);
      return;
    }
    const confirmed = preview;
    const result = await run(() => createAdjustmentAction({ idempotencyKey, incomeId: row.id, kind, amount, effectiveOn, reason }));
    if (result === undefined) return; // already submitting
    if (result === null) {
      setProblem(CONNECTION_PROBLEM);
      return;
    }
    if (!result.ok) {
      const fieldErrors: Partial<Record<RefundField, string>> = {};
      const other: string[] = [];
      for (const [key, message] of Object.entries(result.fieldErrors ?? {})) {
        if ((FIELDS as readonly string[]).includes(key)) fieldErrors[key as RefundField] = message;
        else other.push(message);
      }
      setErrors(fieldErrors);
      setProblem([result.message, ...other.filter((m) => m !== result.message)].join(" "));
      return;
    }
    renewKey();
    setErrors({});
    setProblem(null);
    const label = kind === "refund" ? "Refund" : "Correction";
    toast(
      confirmed.status === "ok"
        ? {
            title: `${label} recorded · this entry's tithe is now ${formatMoney(confirmed.netTitheAfterMinor, row.currency)}`,
            description: `${formatMoney(confirmed.amountMinor, row.currency)} taken off ${formatMoney(row.amountMinor, row.currency)} received.`,
          }
        : { title: `${label} recorded` },
    );
    onSaved(row);
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      onRequestClose={guard}
      title="Refund or correction"
      description={`${formatMoney(row.amountMinor, row.currency)}${row.source ? ` from ${row.source}` : ""}, received ${formatLocalDate(row.receivedOn)}.`}
      footer={
        <>
          <Button variant="ghost" onClick={() => guard() && onClose()} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={pending} loadingLabel="Saving…">
            Record {noun}
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
        <div className="flex flex-col gap-1.5">
          <SegmentedControl
            label="Type"
            hideLabel={false}
            options={KIND_OPTIONS}
            value={kind}
            onChange={(k) => {
              setKind(k);
              clearError("kind");
            }}
            disabled={pending}
          />
          <p className="text-label text-text-3">{KIND_HELP[kind]}</p>
        </div>

        <Field
          label="Amount"
          required
          error={errors.amount}
          hint={`Up to ${formatMoney(row.refundableMinor, row.currency)} can be taken off this entry.`}
        >
          <AmountInput
            size="md"
            value={amount}
            data-autofocus
            aria-describedby={previewId}
            onChange={(e) => {
              setAmount(e.target.value);
              clearError("amount");
            }}
            currencySlot={<span className="px-2 text-label font-medium text-text-2">{row.currency}</span>}
          />
        </Field>

        <Field label="Effective date" required error={errors.effectiveOn} hint={`Between ${formatLocalDate(row.receivedOn)} and today.`}>
          <DateInput
            value={effectiveOn}
            min={row.receivedOn}
            max={today}
            onChange={(e) => {
              setEffectiveOn(e.target.value);
              clearError("effectiveOn");
            }}
            className="w-full"
          />
        </Field>

        <Field label="Reason" required error={errors.reason}>
          <TextInput
            value={reason}
            maxLength={TEXT_LIMITS.reason}
            placeholder={kind === "refund" ? "e.g. Returned the deposit" : "e.g. Entered 1,750 instead of 1,570"}
            onChange={(e) => {
              setReason(e.target.value);
              clearError("reason");
            }}
          />
        </Field>

        <RefundPreviewLine id={previewId} row={row} preview={preview} />

        {problem ? (
          <InlineAlert tone="danger" live="alert">
            {problem}
          </InlineAlert>
        ) : null}
      </form>
    </Dialog>
  );
}
