"use client";

import { useId, useState, useTransition } from "react";

import { formatLocalDate, formatMoney } from "@/domain";
import { Button, Field, InlineAlert, Sheet, TextInput, Textarea, useToast } from "@/components/ui";
import { TEXT_LIMITS } from "@/lib/validation/limits";
import type { PaymentVM } from "@/lib/view-models";
import { updatePaymentDetailsAction } from "@/server/actions/payments";

import { useIdempotencyKey, useUnsavedChangesGuard, type FormFailure } from "./form-session";

export interface EditPaymentDialogProps {
  payment: PaymentVM;
  open: boolean;
  onClose: () => void;
}

/**
 * Edits a payment's church, reference and note (optimistic concurrency via the payment's version).
 * Amount, currency, date and allocations never change: the dialog says to reverse and re-record instead.
 */
export function EditPaymentDialog({ payment, open, onClose }: EditPaymentDialogProps) {
  const formId = useId();
  const { toast } = useToast();
  const [idempotencyKey, renewKey] = useIdempotencyKey();
  const [pending, startTransition] = useTransition();
  const [initial] = useState(() => ({
    churchName: payment.churchName,
    reference: payment.reference ?? "",
    note: payment.note ?? "",
  }));
  const [values, setValues] = useState(initial);
  const [failure, setFailure] = useState<FormFailure | null>(null);
  const errors = failure?.fieldErrors ?? {};
  const dirty = values.churchName !== initial.churchName || values.reference !== initial.reference || values.note !== initial.note;
  const guard = useUnsavedChangesGuard(dirty && open, pending);

  const change = (patch: Partial<typeof values>) => setValues((v) => ({ ...v, ...patch }));

  const submit = () => {
    if (pending) return;
    if (values.churchName.trim() === "") {
      setFailure({ message: "Please check the highlighted fields.", fieldErrors: { churchName: "Enter the church you gave to." } });
      return;
    }
    startTransition(async () => {
      const result = await updatePaymentDetailsAction({
        idempotencyKey,
        id: payment.id,
        expectedVersion: payment.version,
        churchName: values.churchName,
        reference: values.reference,
        note: values.note,
      });
      if (!result.ok) {
        setFailure({ message: result.message, fieldErrors: result.fieldErrors ?? {} });
        return;
      }
      renewKey();
      toast({ title: "Payment details saved" });
      onClose();
    });
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      onRequestClose={guard}
      title="Edit payment details"
      description={`${formatMoney(payment.amountMinor, payment.currency)} paid ${formatLocalDate(payment.paidOn)}. To change the amount, date or split, reverse this payment and record it again.`}
      footer={
        <>
          <Button variant="ghost" onClick={() => guard() && onClose()} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={pending} loadingLabel="Saving…">
            Save details
          </Button>
        </>
      }
    >
      <form
        id={formId}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex flex-col gap-4"
      >
        <Field label="Church" required error={errors.churchName}>
          <TextInput
            maxLength={TEXT_LIMITS.churchName}
            value={values.churchName}
            disabled={pending}
            onChange={(e) => change({ churchName: e.target.value })}
          />
        </Field>
        <Field label="Reference" showOptional error={errors.reference}>
          <TextInput
            maxLength={TEXT_LIMITS.reference}
            value={values.reference}
            disabled={pending}
            onChange={(e) => change({ reference: e.target.value })}
          />
        </Field>
        <Field label="Note" showOptional error={errors.note}>
          <Textarea
            rows={3}
            maxLength={TEXT_LIMITS.note}
            value={values.note}
            disabled={pending}
            onChange={(e) => change({ note: e.target.value })}
          />
        </Field>
        {failure && !Object.values(failure.fieldErrors).includes(failure.message) ? (
          <InlineAlert tone="danger" live="alert">
            {failure.message}
          </InlineAlert>
        ) : null}
      </form>
    </Sheet>
  );
}
