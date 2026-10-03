"use client";

import { useId, useRef, useState, useTransition } from "react";

import { AMOUNT_ERROR_MESSAGES, formatMinor, formatMoney, parseAmount, type Currency, type LocalDate } from "@/domain";
import { useIdempotencyKey, useUnsavedChangesGuard, type FormFailure } from "@/components/given/form-session";
import { AmountInput, Button, CurrencyToggle, DateInput, Dialog, Field, InlineAlert, Textarea, TextInput, useToast } from "@/components/ui";
import { DEFAULT_OPENING_LABEL, TEXT_LIMITS } from "@/lib/validation/limits";
import type { OpeningVM } from "@/lib/view-models";
import { createOpeningObligationAction, updateOpeningObligationAction } from "@/server/actions/opening";

import { MIN_DATE } from "./tracking-form";

export interface OpeningDialogProps {
  open: boolean;
  onClose: () => void;
  /** The opening balance to edit; omit to add a new one. */
  opening?: OpeningVM;
  today: LocalDate;
  defaultCurrency: Currency;
}

interface Draft {
  amount: string;
  currency: Currency;
  effectiveOn: string;
  label: string;
  note: string;
}

function initialDraft(opening: OpeningVM | undefined, today: LocalDate, currency: Currency): Draft {
  if (!opening) return { amount: "", currency, effectiveOn: today, label: "", note: "" };
  return {
    amount: formatMinor(opening.amountMinor),
    currency: opening.currency,
    effectiveOn: opening.effectiveOn,
    label: opening.label === DEFAULT_OPENING_LABEL ? "" : opening.label,
    note: opening.note ?? "",
  };
}

function sameDraft(a: Draft, b: Draft): boolean {
  return (
    a.amount.trim() === b.amount.trim() &&
    a.currency === b.currency &&
    a.effectiveOn === b.effectiveOn &&
    a.label.trim() === b.label.trim() &&
    a.note.trim() === b.note.trim()
  );
}

/**
 * Add or edit an opening balance: a tithe already owed before recording started. It adds to what is owed and is
 * never counted as income. Mount with a fresh `key` per opening so each session starts from the stored values.
 */
export function OpeningDialog({ open, onClose, opening, today, defaultCurrency }: OpeningDialogProps) {
  const formId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const { toast } = useToast();
  const [idempotencyKey, renewKey] = useIdempotencyKey();
  const [pending, startTransition] = useTransition();
  const [initial] = useState(() => initialDraft(opening, today, defaultCurrency));
  const [draft, setDraft] = useState(initial);
  const [failure, setFailure] = useState<FormFailure | null>(null);
  const editing = opening !== undefined;
  const dirty = !sameDraft(draft, initial);
  const guard = useUnsavedChangesGuard(open && dirty, pending, "Discard this opening balance? Nothing has been saved.");
  const errors = failure?.fieldErrors ?? {};

  const change = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    if (failure) setFailure(null);
  };

  const fail = (next: FormFailure) => {
    setFailure(next);
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
  };

  const submit = () => {
    if (pending) return;
    const parsed = parseAmount(draft.amount);
    const clientErrors: Record<string, string> = {};
    if (!parsed.ok) clientErrors.amount = AMOUNT_ERROR_MESSAGES[parsed.error];
    if (draft.effectiveOn === "") clientErrors.effectiveOn = "Enter a date.";
    if (!parsed.ok || Object.keys(clientErrors).length > 0) {
      fail({ message: "Please check the highlighted fields.", fieldErrors: clientErrors });
      return;
    }
    if (editing && !dirty) {
      onClose();
      return;
    }
    startTransition(async () => {
      const fields = { ...draft, label: draft.label.trim() === "" ? null : draft.label, note: draft.note.trim() === "" ? null : draft.note };
      const result = opening
        ? await updateOpeningObligationAction({ idempotencyKey, id: opening.id, expectedVersion: opening.version, ...fields })
        : await createOpeningObligationAction({ idempotencyKey, ...fields });
      if (!result.ok) {
        const message =
          result.code === "stale"
            ? "This opening balance was changed somewhere else. Close this dialog to see the latest version, then edit again."
            : result.message;
        fail({ message, fieldErrors: result.fieldErrors ?? {} });
        return;
      }
      renewKey();
      toast({
        title: editing ? "Opening balance updated" : "Opening balance added",
        description: `${formatMoney(parsed.minor, draft.currency)} is included in what you still have to give.`,
      });
      onClose();
    });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      onRequestClose={guard}
      title={editing ? "Edit opening balance" : "Add an opening balance"}
      description="A tithe you already owed before you started recording income. It's added to what you owe but never counted as income."
      footer={
        <>
          <Button variant="ghost" onClick={() => guard() && onClose()} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={pending} loadingLabel="Saving…">
            {editing ? "Save changes" : "Add opening balance"}
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
        className="flex flex-col gap-4"
      >
        <Field label="Amount owed" required error={errors.amount} hint="The tithe itself, not the income it came from.">
          <AmountInput
            data-autofocus
            size="lg"
            value={draft.amount}
            disabled={pending}
            onChange={(e) => change({ amount: e.target.value })}
            currencySlot={
              <CurrencyToggle label="Currency" value={draft.currency} disabled={pending} onChange={(currency) => change({ currency })} />
            }
          />
        </Field>
        <Field
          label="Owed as of"
          required
          error={errors.effectiveOn}
          hint="Can be before your tracking start. It counts in that date's year."
        >
          <DateInput min={MIN_DATE} max={today} value={draft.effectiveOn} disabled={pending} onChange={(e) => change({ effectiveOn: e.target.value })} />
        </Field>
        <Field label="Label" showOptional error={errors.label}>
          <TextInput
            value={draft.label}
            placeholder={DEFAULT_OPENING_LABEL}
            maxLength={TEXT_LIMITS.label}
            disabled={pending}
            onChange={(e) => change({ label: e.target.value })}
          />
        </Field>
        <Field label="Note" showOptional error={errors.note}>
          <Textarea rows={2} maxLength={TEXT_LIMITS.note} value={draft.note} disabled={pending} onChange={(e) => change({ note: e.target.value })} />
        </Field>
        {failure && !Object.values(failure.fieldErrors).includes(failure.message) ? (
          <InlineAlert tone="danger" live="alert">
            {failure.message}
          </InlineAlert>
        ) : null}
      </form>
    </Dialog>
  );
}
