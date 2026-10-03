"use client";

import { useId, useRef, useState, useTransition } from "react";

import { AMOUNT_ERROR_MESSAGES, formatMoney, parseAmount, type Currency, type LocalDate, type Minor, type SetAsideKind } from "@/domain";
import {
  AmountInput,
  Button,
  CurrencyToggle,
  DateInput,
  Field,
  InlineAlert,
  SegmentedControl,
  Sheet,
  Textarea,
  useToast,
} from "@/components/ui";
import { TEXT_LIMITS } from "@/lib/validation/limits";
import { createSetAsideAction } from "@/server/actions/set-aside";

import { useIdempotencyKey, useUnsavedChangesGuard, type FormFailure } from "@/components/given/form-session";

const KIND_OPTIONS = [
  { value: "reserve", label: "Reserve" },
  { value: "release", label: "Release" },
] as const satisfies readonly { value: SetAsideKind; label: string }[];

export interface SetAsideEntryDialogProps {
  open: boolean;
  onClose: () => void;
  today: LocalDate;
  defaultCurrency: Currency;
  /** Current Set aside balance per currency (shown as "Available" when releasing). */
  balances: Record<Currency, Minor>;
}

interface Draft {
  kind: SetAsideKind;
  amount: string;
  currency: Currency;
  effectiveOn: string;
  note: string;
}

/** Records money reserved for (or released from) the tithe. Never changes what is owed. */
export function SetAsideEntryDialog({ open, onClose, today, defaultCurrency, balances }: SetAsideEntryDialogProps) {
  const formId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const { toast } = useToast();
  const [idempotencyKey, renewKey] = useIdempotencyKey();
  const [pending, startTransition] = useTransition();
  const [initial] = useState<Draft>(() => ({ kind: "reserve", amount: "", currency: defaultCurrency, effectiveOn: today, note: "" }));
  const [draft, setDraft] = useState(initial);
  const [failure, setFailure] = useState<FormFailure | null>(null);
  const errors = failure?.fieldErrors ?? {};
  const dirty = draft.amount !== initial.amount || draft.note !== initial.note || draft.effectiveOn !== initial.effectiveOn;
  const guard = useUnsavedChangesGuard(dirty && open, pending);

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
    else if (draft.effectiveOn > today) clientErrors.effectiveOn = "The date can't be in the future.";
    if (!parsed.ok || Object.keys(clientErrors).length > 0) {
      fail({ message: "Please check the highlighted fields.", fieldErrors: clientErrors });
      return;
    }
    startTransition(async () => {
      const result = await createSetAsideAction({ idempotencyKey, ...draft });
      if (!result.ok) {
        fail({ message: result.message, fieldErrors: result.fieldErrors ?? {} });
        return;
      }
      renewKey();
      const verb = draft.kind === "reserve" ? "Reserved" : "Released";
      toast({ title: `${verb} ${formatMoney(parsed.minor, draft.currency)}`, description: "What you owe hasn't changed." });
      onClose();
    });
  };

  const releasing = draft.kind === "release";
  return (
    <Sheet
      open={open}
      onClose={onClose}
      onRequestClose={guard}
      title="Add a Set aside entry"
      description="Your own record of money reserved for your tithe. It doesn't change what you owe."
      footer={
        <>
          <Button variant="ghost" onClick={() => guard() && onClose()} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={pending} loadingLabel="Saving…">
            Save entry
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
        <SegmentedControl<SetAsideKind>
          label="Type of entry"
          hideLabel={false}
          options={KIND_OPTIONS}
          value={draft.kind}
          onChange={(kind) => change({ kind })}
          fullWidth
          disabled={pending}
        />
        <Field
          label={releasing ? "Amount released" : "Amount reserved"}
          required
          error={errors.amount}
          hint={releasing ? `Available: ${formatMoney(balances[draft.currency], draft.currency)}` : undefined}
        >
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
        <Field label="Date" required error={errors.effectiveOn}>
          <DateInput max={today} value={draft.effectiveOn} disabled={pending} onChange={(e) => change({ effectiveOn: e.target.value })} />
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
    </Sheet>
  );
}
