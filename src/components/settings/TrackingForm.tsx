"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition } from "react";

import { DEFAULT_PAYOUT_DATE, DEFAULT_TRACKING_START, formatLocalDate, toLocalDate, type LocalDate } from "@/domain";
import { useIdempotencyKey, useUnsavedChangesGuard } from "@/components/given/form-session";
import { Button, CurrencyToggle, DateInput, Field, InlineAlert, Select, TextInput, useToast } from "@/components/ui";
import { TEXT_LIMITS } from "@/lib/validation/limits";
import type { SettingsVM } from "@/lib/view-models";
import { updateSettingsAction } from "@/server/actions/settings";

import {
  currentPeriodLabel,
  draftFromSettings,
  isTrackingDirty,
  MIN_DATE,
  missingDateErrors,
  trackingStartMax,
  type TrackingDraft,
  type TrackingField,
} from "./tracking-form";

export interface TrackingFormProps {
  settings: SettingsVM;
  today: LocalDate;
  earliestIncomeDate: LocalDate | null;
  timeZones: readonly string[];
}

interface Failure {
  message: string;
  fieldErrors: Partial<Record<TrackingField, string>>;
  /** The settings changed elsewhere; the only way forward is to load the latest values. */
  stale: boolean;
}

const STALE_MESSAGE =
  "These settings were changed somewhere else, for example in another tab. Load the latest settings, then make your change again.";
const DEFAULT_START_LABEL = formatLocalDate(toLocalDate(DEFAULT_TRACKING_START));
const DEFAULT_PAYOUT_LABEL = formatLocalDate(toLocalDate(DEFAULT_PAYOUT_DATE));

/**
 * Tracking settings: tracking start, next payout date, time zone, display currency and church name.
 * Saves with optimistic concurrency (expectedVersion). When newer settings arrive from the server (another tab or
 * device), a clean form adopts them; a form with unsaved edits keeps them and offers to load the latest instead.
 */
export function TrackingForm({ settings, today, earliestIncomeDate, timeZones }: TrackingFormProps) {
  const router = useRouter();
  const formId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const { toast } = useToast();
  const [idempotencyKey, renewKey] = useIdempotencyKey();
  const [pending, startTransition] = useTransition();
  const [refreshing, startRefresh] = useTransition();
  const [saved, setSaved] = useState(() => draftFromSettings(settings));
  // Tracked locally too, so the form is clean (and a second save is not stale) before the refreshed page arrives.
  const [version, setVersion] = useState(settings.version);
  const [draft, setDraft] = useState<TrackingDraft>(saved);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [seenVersion, setSeenVersion] = useState(settings.version);
  const dirty = isTrackingDirty(draft, saved);
  useUnsavedChangesGuard(dirty, pending);

  const adopt = (next: SettingsVM) => {
    const values = draftFromSettings(next);
    setSaved(values);
    setDraft(values);
    setVersion(next.version);
  };

  // Newer settings from the server (adjusting state during render, React's pattern for props that change).
  if (settings.version !== seenVersion) {
    setSeenVersion(settings.version);
    if (settings.version > version) {
      if (dirty) setFailure({ message: STALE_MESSAGE, fieldErrors: {}, stale: true });
      else adopt(settings);
    }
  }

  const errors = failure?.fieldErrors ?? {};
  const periodLabel = currentPeriodLabel(today, draft.trackingStart, settings.trackingStart);
  const periodChanged = periodLabel !== currentPeriodLabel(today, saved.trackingStart, settings.trackingStart);
  const startMax = trackingStartMax(today, earliestIncomeDate);

  const change = (patch: Partial<TrackingDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    if (failure && !failure.stale) setFailure(null);
  };

  const fail = (next: Failure) => {
    setFailure(next);
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
  };

  const submit = () => {
    if (pending || !dirty) return;
    const missing = missingDateErrors(draft);
    if (Object.keys(missing).length > 0) {
      fail({ message: "Please check the highlighted fields.", fieldErrors: missing, stale: false });
      return;
    }
    startTransition(async () => {
      const result = await updateSettingsAction({ idempotencyKey, expectedVersion: version, ...draft });
      if (!result.ok) {
        const stale = result.code === "stale";
        fail({
          message: stale ? STALE_MESSAGE : result.message,
          fieldErrors: result.fieldErrors ?? {},
          stale,
        });
        return;
      }
      renewKey();
      adopt(result.data);
      const period = currentPeriodLabel(today, result.data.trackingStart, result.data.trackingStart);
      toast({ title: "Settings saved", description: `Current period: ${period}.` });
    });
  };

  // Show the newest settings this page has, and fetch fresher ones in case this page is behind too.
  const loadLatest = () => {
    adopt(settings);
    setFailure(null);
    startRefresh(() => router.refresh());
  };

  return (
    <form
      ref={formRef}
      id={formId}
      noValidate
      aria-busy={pending || undefined}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex max-w-2xl flex-col gap-6"
    >
      <div className="grid gap-x-5 gap-y-5 sm:grid-cols-2">
        <Field
          label="Tracking start"
          required
          error={errors.trackingStart}
          className="sm:col-span-2"
          hint={
            <>
              Income before this date isn&apos;t included. Default {DEFAULT_START_LABEL} — backdate to Jan 1 to include earlier
              income. It can&apos;t be later than today
              {earliestIncomeDate
                ? ` or your earliest income (${formatLocalDate(earliestIncomeDate)}).`
                : ". No income is recorded yet."}
            </>
          }
        >
          <DateInput
            min={MIN_DATE}
            max={startMax}
            value={draft.trackingStart}
            disabled={pending}
            onChange={(e) => change({ trackingStart: e.target.value })}
            className="sm:max-w-[16rem]"
          />
        </Field>

        <Field
          label="Next planned payout"
          required
          error={errors.nextPayoutDate}
          hint={
            settings.nextPayoutIsDefault
              ? `Using the default, ${DEFAULT_PAYOUT_LABEL}. Pick a date to plan your own.`
              : "The day you plan to give what's due. Today or later."
          }
        >
          <DateInput
            min={today}
            value={draft.nextPayoutDate}
            disabled={pending}
            onChange={(e) => change({ nextPayoutDate: e.target.value })}
          />
        </Field>

        <Field label="Time zone" required error={errors.timeZone} hint="Decides what “today” is, when a year ends and the payout countdown.">
          <Select value={draft.timeZone} disabled={pending} onChange={(e) => change({ timeZone: e.target.value })}>
            {timeZones.map((zone) => (
              <option key={zone} value={zone}>
                {zone.replaceAll("_", " ")}
              </option>
            ))}
          </Select>
        </Field>

        <div className="flex flex-col gap-1.5">
          <CurrencyToggle
            label="Display currency"
            hideLabel={false}
            size="md"
            value={draft.displayCurrency}
            disabled={pending}
            onChange={(displayCurrency) => change({ displayCurrency })}
          />
          <p className="text-label text-text-3">Shown first on the Overview. CAD and USD are always kept separate.</p>
        </div>

        <Field label="Church name" showOptional error={errors.churchName} hint="Filled in for you when you record a payment.">
          <TextInput
            value={draft.churchName}
            maxLength={TEXT_LIMITS.churchName}
            autoComplete="organization"
            disabled={pending}
            onChange={(e) => change({ churchName: e.target.value })}
          />
        </Field>
      </div>

      <div className="flex flex-col gap-1 rounded-control border border-line bg-bg/40 px-4 py-3">
        <p className="text-label text-text-2">Current period{periodChanged ? " after saving" : ""}</p>
        <p className="tabular text-[0.9375rem] font-medium text-text" aria-live="polite">
          {periodLabel}
        </p>
      </div>

      {failure ? (
        <InlineAlert
          tone={failure.stale ? "warning" : "danger"}
          live="alert"
          action={
            failure.stale ? (
              <Button size="sm" variant="secondary" onClick={loadLatest} loading={refreshing} loadingLabel="Loading…">
                Load latest
              </Button>
            ) : undefined
          }
        >
          {failure.message}
        </InlineAlert>
      ) : null}

      <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-end">
        <p className="text-label text-text-3 sm:mr-auto" aria-live="polite">
          {dirty ? "You have unsaved changes." : "All changes saved."}
        </p>
        {dirty ? (
          <Button variant="ghost" disabled={pending} onClick={() => {
              setDraft(saved);
              setFailure(null);
            }}>
            Discard changes
          </Button>
        ) : null}
        <Button type="submit" disabled={!dirty || (failure?.stale ?? false)} loading={pending} loadingLabel="Saving…">
          Save settings
        </Button>
      </div>
    </form>
  );
}
