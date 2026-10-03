"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

import type { Currency, LocalDate } from "@/domain";
import { AmountInput, CurrencyToggle, DateInput, Field, TextInput, Textarea } from "@/components/ui";
import { TEXT_LIMITS } from "@/lib/validation/limits";

/** The editable values of a payment form (strings exactly as typed). */
export interface PaymentDraft {
  amount: string;
  currency: Currency;
  paidOn: string;
  churchName: string;
  reference: string;
  note: string;
}

export interface PaymentFieldsProps {
  draft: PaymentDraft;
  onChange: (patch: Partial<PaymentDraft>) => void;
  errors: Readonly<Record<string, string>>;
  today: LocalDate;
  disabled?: boolean;
}

/** Amount + currency, date paid, church, reference and note. No tithe preview: this is money given. */
export function PaymentFields({ draft, onChange, errors, today, disabled }: PaymentFieldsProps) {
  const [showExtras, setShowExtras] = useState(false);
  const extrasOpen = showExtras || draft.reference !== "" || draft.note !== "" || Boolean(errors.reference || errors.note);
  return (
    <div className="flex flex-col gap-4">
      <Field label="Amount paid" required error={errors.amount ?? errors.currency}>
        <AmountInput
          data-autofocus
          size="lg"
          disabled={disabled}
          value={draft.amount}
          onChange={(e) => onChange({ amount: e.target.value })}
          currencySlot={
            <CurrencyToggle
              label="Payment currency"
              value={draft.currency}
              disabled={disabled}
              onChange={(currency) => onChange({ currency })}
            />
          }
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date paid" required error={errors.paidOn}>
          <DateInput
            max={today}
            disabled={disabled}
            value={draft.paidOn}
            onChange={(e) => onChange({ paidOn: e.target.value })}
            className="w-full"
          />
        </Field>
        <Field label="Church" required error={errors.churchName}>
          <TextInput
            autoComplete="organization"
            maxLength={TEXT_LIMITS.churchName}
            disabled={disabled}
            value={draft.churchName}
            onChange={(e) => onChange({ churchName: e.target.value })}
          />
        </Field>
      </div>
      {extrasOpen ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Reference" showOptional hint="E-transfer or cheque number, envelope." error={errors.reference}>
            <TextInput
              // Revealed by "Add a reference or note": continue where the user clicked.
              autoFocus={showExtras}
              autoComplete="off"
              maxLength={TEXT_LIMITS.reference}
              disabled={disabled}
              value={draft.reference}
              onChange={(e) => onChange({ reference: e.target.value })}
            />
          </Field>
          <Field label="Note" showOptional error={errors.note}>
            <Textarea
              rows={2}
              maxLength={TEXT_LIMITS.note}
              disabled={disabled}
              value={draft.note}
              onChange={(e) => onChange({ note: e.target.value })}
              className="min-h-11"
            />
          </Field>
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => setShowExtras(true)}
          className="inline-flex min-h-11 items-center gap-2 self-start rounded-control text-label font-medium text-accent hover:text-accent-hover md:min-h-8"
        >
          <ChevronDown aria-hidden="true" className="size-4" />
          Add a reference or note
        </button>
      )}
    </div>
  );
}
