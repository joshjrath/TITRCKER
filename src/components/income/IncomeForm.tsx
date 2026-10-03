"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { formatMoney } from "@/domain";
import { AmountInput, Button, CurrencyToggle, DateInput, Field, InlineAlert, cn } from "@/components/ui";
import { useUnsavedChanges } from "@/components/app/unsaved-changes";
import type { ActionResult } from "@/lib/action-result";
import { incomeCreateSchema, incomeUpdateSchema, parseWith } from "@/lib/validation";
import type { IncomeMutationResult, IncomeRowVM } from "@/lib/view-models";
import { createIncomeAction, updateIncomeAction } from "@/server/actions/income";
import { IncomeDetailsFields } from "./IncomeDetailsFields";
import {
  DETAIL_FIELDS,
  initialIncomeValues,
  isIncomeFormDirty,
  optionalInput,
  splitFieldErrors,
  type IncomeField,
  type IncomeFormDefaults,
  type IncomeFormValues,
} from "./form-state";

export interface IncomeFormProps {
  mode: "create" | "edit";
  /** The entry being edited (edit mode). Remount the form (React `key`) to load a newer version. */
  initial?: IncomeRowVM;
  defaults: IncomeFormDefaults;
  /** Called once per confirmed save (ok: true), after the form has reset (create) or settled (edit). */
  onSaved?: (result: IncomeMutationResult) => void;
  /** Reports whether the form holds unsaved input (for a Dialog onRequestClose guard). */
  onDirtyChange?: (dirty: boolean) => void;
  /** Quick-entry layout: optional fields sit behind an "Add details" disclosure. */
  compact?: boolean;
  className?: string;
}

interface FormProblem {
  message: string;
  extra: string[];
  stale: boolean;
}

const NETWORK_PROBLEM: FormProblem = {
  message: "We couldn't confirm the save. Check your connection and try again — retrying won't add it twice.",
  extra: [],
  stale: false,
};

function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

function hasDetails(v: IncomeFormValues): boolean {
  return DETAIL_FIELDS.some((f) => v[f].trim() !== "");
}

/**
 * The one income form (quick entry panel, add sheet, edit dialog). Amount + currency + date received are
 * required; payer/source, category and note are optional. Calls the income Server Actions with a plain object
 * and one idempotency key per form instance (regenerated only after ok: true), so double clicks and retries
 * never save twice. On failure the typed values stay and errors show next to their fields.
 */
export function IncomeForm({ mode, initial, defaults, onSaved, onDirtyChange, compact = false, className }: IncomeFormProps) {
  const router = useRouter();
  const formId = useId();
  const detailsId = `${formId}-details`;
  const [start, setStart] = useState<IncomeFormValues>(() => initialIncomeValues(defaults, initial));
  const [values, setValues] = useState<IncomeFormValues>(start);
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const [errors, setErrors] = useState<Partial<Record<IncomeField, string>>>({});
  const [problem, setProblem] = useState<FormProblem | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(() => !compact || hasDetails(start));
  const amountRef = useRef<HTMLInputElement>(null);

  const dirty = isIncomeFormDirty(values, start, mode);

  // Report dirtiness to the container (dialog guard) without re-subscribing on every render.
  const onDirtyRef = useRef(onDirtyChange);
  useEffect(() => {
    onDirtyRef.current = onDirtyChange;
  });
  useEffect(() => {
    onDirtyRef.current?.(dirty);
  }, [dirty]);

  // Warn before an in-app link, sign out, a reload or a tab close drops typed input.
  useUnsavedChanges(dirty);

  function update<K extends keyof IncomeFormValues>(field: K, value: IncomeFormValues[K]) {
    setValues((v) => ({ ...v, [field]: value }));
    if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }));
  }

  function showErrors(fieldErrors: Record<string, string> | undefined, message: string, stale = false) {
    const { fields, other } = splitFieldErrors(fieldErrors);
    setErrors(fields);
    setProblem({ message, extra: other, stale });
    if (DETAIL_FIELDS.some((f) => fields[f])) setDetailsOpen(true);
    if (fields.amount || fields.currency) amountRef.current?.focus();
  }

  function payload() {
    return {
      idempotencyKey,
      amount: values.amount,
      currency: values.currency,
      receivedOn: values.receivedOn,
      source: optionalInput(values.source),
      category: optionalInput(values.category),
      note: optionalInput(values.note),
    };
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (inFlight.current) return;
    const base = payload();
    const input = mode === "edit" && initial ? { ...base, id: initial.id, expectedVersion: initial.version } : base;

    // Same shared schema the server re-checks: instant field messages, no round trip for typos.
    const check = parseWith(mode === "edit" ? incomeUpdateSchema : incomeCreateSchema, input);
    if (!check.ok) {
      showErrors(check.fieldErrors, "Please check the highlighted fields.");
      return;
    }

    inFlight.current = true;
    setPending(true);
    let result: ActionResult<IncomeMutationResult> | null = null;
    try {
      result =
        mode === "edit" && initial
          ? await updateIncomeAction({ ...base, id: initial.id, expectedVersion: initial.version })
          : await createIncomeAction(base);
    } catch {
      result = null;
    } finally {
      inFlight.current = false;
      setPending(false);
    }

    if (!result) {
      setProblem(NETWORK_PROBLEM);
      return;
    }
    if (!result.ok) {
      showErrors(result.fieldErrors, result.message, result.code === "stale");
      return;
    }

    setErrors({});
    setProblem(null);
    setIdempotencyKey(newIdempotencyKey());
    if (mode === "create") {
      // Ready for the next entry: same currency, today's date, focus back on the amount.
      const next = { ...initialIncomeValues(defaults), currency: values.currency };
      setStart(next);
      setValues(next);
      setDetailsOpen(!compact);
      amountRef.current?.focus();
    } else {
      setStart(values);
    }
    onSaved?.(result.data);
  }

  const refundHint =
    mode === "edit" && initial && initial.refundedMinor > 0
      ? `Refunds on this entry total ${formatMoney(initial.refundedMinor, initial.currency)}, so the amount can't go below that.`
      : undefined;

  return (
    <form onSubmit={submit} noValidate aria-busy={pending || undefined} className={cn("flex flex-col gap-4", className)}>
      <Field label="Amount received" required error={errors.amount ?? errors.currency} hint={refundHint}>
        <AmountInput
          ref={amountRef}
          name="amount"
          value={values.amount}
          onChange={(e) => update("amount", e.target.value)}
          tithePreviewCurrency={values.currency}
          size={compact ? "md" : "lg"}
          data-autofocus
          currencySlot={
            <CurrencyToggle
              value={values.currency}
              onChange={(c) => update("currency", c)}
              label="Currency received"
              disabled={pending}
            />
          }
        />
      </Field>

      <Field label="Date received" required error={errors.receivedOn}>
        <DateInput
          name="receivedOn"
          value={values.receivedOn}
          min={defaults.trackingStart}
          max={defaults.today}
          onChange={(e) => update("receivedOn", e.target.value)}
          className="w-full"
        />
      </Field>

      {compact ? (
        <button
          type="button"
          aria-expanded={detailsOpen}
          aria-controls={detailsId}
          onClick={() => setDetailsOpen((o) => !o)}
          className="-mx-1 inline-flex w-fit items-center gap-1.5 rounded-control px-1 py-1 text-label font-medium text-text-2 hover:text-text"
        >
          <ChevronDown aria-hidden="true" className={cn("size-4 transition-transform", detailsOpen && "rotate-180")} />
          {detailsOpen ? "Hide details" : "Add details"}
          <span className="font-normal text-text-3">· source, category, note</span>
        </button>
      ) : null}

      <div id={detailsId} hidden={!detailsOpen}>
        <IncomeDetailsFields
          values={values}
          errors={errors}
          categories={defaults.categories}
          onChange={(field, value) => update(field, value)}
          twoColumn={!compact}
        />
      </div>

      {problem ? (
        <InlineAlert
          live="alert"
          tone={problem.stale ? "warning" : "danger"}
          title={problem.stale ? "This entry changed elsewhere" : undefined}
          action={
            problem.stale ? (
              <Button size="sm" variant="secondary" onClick={() => router.refresh()}>
                Reload
              </Button>
            ) : undefined
          }
        >
          <p>{problem.message}</p>
          {problem.extra.map((m) => (
            <p key={m}>{m}</p>
          ))}
          {problem.stale ? <p>Reload, then reopen the entry to edit the latest version.</p> : null}
        </InlineAlert>
      ) : null}

      {/* In a phone sheet this row sticks to the bottom so Save stays visible above the keyboard. */}
      <div data-sticky-submit>
        <Button type="submit" size={compact ? "md" : "lg"} fullWidth loading={pending} loadingLabel="Saving…">
          {mode === "edit" ? "Save changes" : "Save income"}
        </Button>
      </div>
    </form>
  );
}
