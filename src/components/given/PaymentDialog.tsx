"use client";

import { useId, useRef, useState, useTransition } from "react";

import { AMOUNT_ERROR_MESSAGES, formatMoney, parseAmount, type Currency } from "@/domain";
import { Amount, Button, InlineAlert, Sheet, useToast } from "@/components/ui";
import { recordPaymentAction } from "@/server/actions/payments";

import {
  allocationErrorsByYear,
  allocationInputs,
  amountText,
  creditExplanation,
  parsedAmountOrNull,
  previewAllocation,
  type AllocationPreview,
  type SplitDraft,
} from "./allocation-form";
import { useIdempotencyKey, useUnsavedChangesGuard, type FormFailure } from "./form-session";
import { AllocationReview } from "./AllocationReview";
import type { PaymentFormContext } from "./payment-context";
import { PaymentConfirmations } from "./PaymentConfirmations";
import { PaymentFields, type PaymentDraft } from "./PaymentFields";

export type PaymentDialogMode = "record" | "payout";

export interface PaymentDialogProps {
  open: boolean;
  onClose: () => void;
  /** "record" starts empty; "payout" prefills the amount still to give and is titled "Review your payout". */
  mode: PaymentDialogMode;
  context: PaymentFormContext;
  /** Called with the new payment id after the server confirmed it. */
  onRecorded?: (paymentId: string) => void;
}

function dueText(context: PaymentFormContext, currency: Currency): string {
  const due = context.perCurrency[currency].stillToGiveMinor;
  return due > 0 ? amountText(due) : "";
}

function initialDraft(mode: PaymentDialogMode, context: PaymentFormContext): PaymentDraft {
  return {
    amount: mode === "payout" ? dueText(context, context.defaultCurrency) : "",
    currency: context.defaultCurrency,
    paidOn: context.today,
    churchName: context.churchName,
    reference: "",
    note: "",
  };
}

interface Confirmations {
  credit: boolean;
  setAside: boolean;
  made: boolean;
}

/** Client-side checks mirroring the server, so obvious mistakes never make a round trip. */
function checkBeforeSubmit(
  draft: PaymentDraft,
  preview: AllocationPreview | null,
  confirms: Confirmations,
  today: string,
): Record<string, string> {
  const errors: Record<string, string> = {};
  const parsed = parseAmount(draft.amount);
  if (!parsed.ok) errors.amount = AMOUNT_ERROR_MESSAGES[parsed.error];
  if (draft.paidOn === "") errors.paidOn = "Enter the date you paid.";
  else if (draft.paidOn > today) errors.paidOn = "The payment date can't be in the future.";
  if (draft.churchName.trim() === "") errors.churchName = "Enter the church you gave to.";
  if (preview?.error) errors.allocations = preview.error;
  if (preview && preview.creditMinor > 0 && !confirms.credit) {
    errors.confirmCredit = 'Tick "Keep the extra as credit" to record this payment.';
  }
  if (!confirms.made) errors.confirmMadePayment = 'Tick "I made this payment" to record it.';
  return errors;
}

/**
 * Records a church payment made elsewhere, or reviews the payout (same form, amount prefilled). Shows which
 * periods the payment covers (domain proposeAllocation, oldest first) with an editable split, asks for explicit
 * confirmation of any credit, and records nothing until "I made this payment" is ticked and the server says ok.
 */
export function PaymentDialog({ open, onClose, mode, context, onRecorded }: PaymentDialogProps) {
  const formId = useId();
  const { toast } = useToast();
  const [idempotencyKey, renewKey] = useIdempotencyKey();
  const [pending, startTransition] = useTransition();
  const [initial] = useState(() => initialDraft(mode, context));
  const [draft, setDraft] = useState(initial);
  const [split, setSplit] = useState<SplitDraft | null>(null);
  const [confirms, setConfirms] = useState<Confirmations>({ credit: false, setAside: false, made: false });
  const [failure, setFailure] = useState<FormFailure | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [submittedLines, setSubmittedLines] = useState<{ bucketYear: number }[]>([]);

  const currencyContext = context.perCurrency[draft.currency];
  const amountMinor = parsedAmountOrNull(draft.amount);
  const preview = amountMinor === null ? null : previewAllocation(amountMinor, draft.currency, currencyContext.buckets, split);
  const creditMessage = preview ? creditExplanation(preview, draft.currency) : null;
  const errors = failure?.fieldErrors ?? {};

  const dirty =
    (Object.keys(initial) as (keyof PaymentDraft)[]).some((k) => draft[k] !== initial[k]) ||
    split !== null ||
    confirms.credit ||
    confirms.setAside ||
    confirms.made;
  const guard = useUnsavedChangesGuard(dirty && open, pending, "Discard this payment? Nothing has been recorded.");

  /** Shows a failure and moves focus to the first invalid control (or the form-level message). */
  const fail = (next: FormFailure) => {
    setFailure(next);
    requestAnimationFrame(() => {
      const form = formRef.current;
      const target = form?.querySelector<HTMLElement>('[aria-invalid="true"]') ?? form?.querySelector<HTMLElement>("[data-form-error]");
      target?.focus();
    });
  };

  const clearErrors = (...keys: string[]) => {
    if (!failure || !keys.some((k) => k in failure.fieldErrors)) return;
    const next = { ...failure.fieldErrors };
    for (const k of keys) delete next[k];
    setFailure({ ...failure, fieldErrors: next });
  };

  const changeDraft = (patch: Partial<PaymentDraft>) => {
    setDraft((d) => {
      const next = { ...d, ...patch };
      if (patch.currency && patch.currency !== d.currency) {
        // Buckets differ per currency: drop a custom split; in payout mode follow the new currency's due amount.
        if (mode === "payout" && (d.amount === "" || d.amount === dueText(context, d.currency))) {
          next.amount = dueText(context, patch.currency);
        }
      }
      return next;
    });
    if (patch.currency && patch.currency !== draft.currency) {
      setSplit(null);
      setConfirms((c) => ({ ...c, credit: false, setAside: false }));
    }
    clearErrors(...Object.keys(patch), "allocations", "form");
  };

  const submit = () => {
    if (pending) return;
    const clientErrors = checkBeforeSubmit(draft, preview, confirms, context.today);
    if (Object.keys(clientErrors).length > 0 || amountMinor === null || preview === null) {
      fail({ message: "Please check the highlighted fields.", fieldErrors: clientErrors });
      return;
    }
    const allocations = allocationInputs(preview.lines);
    setSubmittedLines(allocations);
    const church = draft.churchName.trim();
    startTransition(async () => {
      const result = await recordPaymentAction({
        idempotencyKey,
        amount: draft.amount,
        currency: draft.currency,
        paidOn: draft.paidOn,
        churchName: draft.churchName,
        reference: draft.reference,
        note: draft.note,
        allocations,
        confirmCredit: confirms.credit,
        confirmMadePayment: confirms.made,
        drawFromSetAside: confirms.setAside,
      });
      if (!result.ok) {
        fail({ message: result.message, fieldErrors: result.fieldErrors ?? {} });
        return;
      }
      renewKey();
      setFailure(null);
      toast({
        title: `Payment recorded · ${formatMoney(amountMinor, draft.currency)} to ${church}`,
        description:
          result.data.creditMinor > 0 ? `${formatMoney(result.data.creditMinor, draft.currency)} kept as credit.` : undefined,
      });
      onRecorded?.(result.data.id);
      onClose();
    });
  };

  const serverLineErrors = allocationErrorsByYear(errors, submittedLines);
  const payout = mode === "payout";

  return (
    <Sheet
      open={open}
      onClose={onClose}
      onRequestClose={guard}
      title={payout ? "Review your payout" : "Record a payment"}
      description={
        payout
          ? "Check the amount and what it covers. Nothing is recorded until you confirm you made the payment."
          : "Record money you already gave to your church. Tenth never moves money."
      }
      footer={
        <>
          <Button variant="ghost" onClick={() => guard() && onClose()} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={pending} loadingLabel="Recording…">
            Record payment
          </Button>
        </>
      }
    >
      <form
        ref={formRef}
        id={formId}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex flex-col gap-5"
      >
        {payout ? (
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-control border border-line bg-surface px-4 py-3">
            <span className="text-label text-text-2">Still to give · {context.payoutSummary}</span>
            <Amount minor={currencyContext.stillToGiveMinor} currency={draft.currency} size="lg" />
          </div>
        ) : null}
        <PaymentFields draft={draft} onChange={changeDraft} errors={errors} today={context.today} disabled={pending} />
        <AllocationReview
          currency={draft.currency}
          amountMinor={amountMinor}
          buckets={currencyContext.buckets}
          preview={preview}
          split={split}
          onSplitChange={(next) => {
            setSplit(next);
            clearErrors("allocations");
          }}
          error={errors.allocations}
          lineErrors={serverLineErrors}
          disabled={pending}
        />
        <PaymentConfirmations
          currency={draft.currency}
          creditMessage={creditMessage}
          confirmCredit={confirms.credit}
          onConfirmCredit={(credit) => {
            setConfirms((c) => ({ ...c, credit }));
            clearErrors("confirmCredit");
          }}
          setAsideMinor={currencyContext.setAsideMinor}
          drawFromSetAside={confirms.setAside}
          onDrawFromSetAside={(setAside) => setConfirms((c) => ({ ...c, setAside }))}
          churchName={draft.churchName}
          confirmMade={confirms.made}
          onConfirmMade={(made) => {
            setConfirms((c) => ({ ...c, made }));
            clearErrors("confirmMadePayment");
          }}
          errors={errors}
          disabled={pending}
        />
        {failure && !Object.values(failure.fieldErrors).includes(failure.message) ? (
          <div data-form-error tabIndex={-1} className="outline-none">
            <InlineAlert tone="danger" live="alert">
              {failure.message}
            </InlineAlert>
          </div>
        ) : null}
      </form>
    </Sheet>
  );
}
