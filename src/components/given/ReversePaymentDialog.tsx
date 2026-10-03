"use client";

import { useId, useState, useTransition } from "react";

import { formatLocalDate, formatMoney } from "@/domain";
import { Button, Dialog, Field, InlineAlert, TextInput, useToast } from "@/components/ui";
import { TEXT_LIMITS } from "@/lib/validation/limits";
import type { PaymentVM } from "@/lib/view-models";
import { reversePaymentAction } from "@/server/actions/payments";

import { useIdempotencyKey, useUnsavedChangesGuard, type FormFailure } from "./form-session";

export interface ReversePaymentDialogProps {
  payment: PaymentVM;
  open: boolean;
  onClose: () => void;
}

/** Confirms a reversal (reason required). Explains that the amount goes back into Still to give. */
export function ReversePaymentDialog({ payment, open, onClose }: ReversePaymentDialogProps) {
  const formId = useId();
  const { toast } = useToast();
  const [idempotencyKey, renewKey] = useIdempotencyKey();
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState("");
  const [failure, setFailure] = useState<FormFailure | null>(null);
  const guard = useUnsavedChangesGuard(reason.trim() !== "" && open, pending);
  const amount = formatMoney(payment.amountMinor, payment.currency);

  const submit = () => {
    if (pending) return;
    if (reason.trim() === "") {
      setFailure({ message: "Add a reason to reverse this payment.", fieldErrors: { reason: "Enter a reason." } });
      return;
    }
    startTransition(async () => {
      const result = await reversePaymentAction({ idempotencyKey, id: payment.id, reason });
      if (!result.ok) {
        setFailure({ message: result.message, fieldErrors: result.fieldErrors ?? {} });
        return;
      }
      renewKey();
      toast({ title: `Payment reversed · ${amount} no longer counts as given` });
      onClose();
    });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      onRequestClose={guard}
      size="sm"
      title="Reverse this payment?"
      description={`${amount} to ${payment.churchName}, paid ${formatLocalDate(payment.paidOn)}.`}
      footer={
        <>
          <Button variant="ghost" onClick={() => guard() && onClose()} disabled={pending}>
            Keep payment
          </Button>
          <Button type="submit" form={formId} variant="danger" loading={pending} loadingLabel="Reversing…">
            Reverse payment
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
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-[0.875rem] text-text-2 marker:text-text-3">
          <li>
            Use this if the payment didn&apos;t happen or was recorded by mistake. {amount} stops counting as given, so what you
            still have to give in {payment.currency} goes back up.
            {payment.unallocatedMinor > 0
              ? ` Its ${formatMoney(payment.unallocatedMinor, payment.currency)} of credit is removed too.`
              : null}
          </li>
          {payment.linkedSetAsideMinor > 0 ? (
            <li>
              The {formatMoney(payment.linkedSetAsideMinor, payment.currency)} it took out of Set aside goes back into Set
              aside.
            </li>
          ) : null}
          <li>The payment stays in your history, marked Reversed with your reason.</li>
        </ul>
        <Field label="Reason" required error={failure?.fieldErrors.reason}>
          <TextInput
            maxLength={TEXT_LIMITS.reason}
            placeholder="e.g. Recorded twice"
            value={reason}
            disabled={pending}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
        {failure ? (
          <InlineAlert tone="danger" live="alert">
            {failure.message}
          </InlineAlert>
        ) : null}
      </form>
    </Dialog>
  );
}
