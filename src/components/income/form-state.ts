import { formatMinor, type Currency } from "@/domain";
import type { IncomeRowVM } from "@/lib/view-models";

/** What the income form needs to start: today (default + max date), last used currency, tracking start, categories. */
export interface IncomeFormDefaults {
  today: string;
  currency: Currency;
  trackingStart: string;
  categories: readonly string[];
}

/** The raw (as typed) values of the income form. Amount stays a string: the domain parser is strict. */
export interface IncomeFormValues {
  amount: string;
  currency: Currency;
  receivedOn: string;
  source: string;
  category: string;
  note: string;
}

export const INCOME_FIELDS = ["amount", "currency", "receivedOn", "source", "category", "note"] as const;
export type IncomeField = (typeof INCOME_FIELDS)[number];

/** Fields behind the "Add details" disclosure in compact mode. */
export const DETAIL_FIELDS = ["source", "category", "note"] as const satisfies readonly IncomeField[];

/** Starting values: the entry being edited, or an empty entry for today in the default currency. */
export function initialIncomeValues(defaults: IncomeFormDefaults, initial?: IncomeRowVM): IncomeFormValues {
  if (initial) {
    return {
      amount: formatMinor(initial.amountMinor),
      currency: initial.currency,
      receivedOn: initial.receivedOn,
      source: initial.source ?? "",
      category: initial.category ?? "",
      note: initial.note ?? "",
    };
  }
  return { amount: "", currency: defaults.currency, receivedOn: defaults.today, source: "", category: "", note: "" };
}

/**
 * True when the form holds something worth warning about before leaving. In create mode a changed currency
 * alone is not "dirty" (it is a preference, not entered data); in edit mode any change counts.
 */
export function isIncomeFormDirty(values: IncomeFormValues, start: IncomeFormValues, mode: "create" | "edit"): boolean {
  return INCOME_FIELDS.some((field) => {
    if (mode === "create" && field === "currency") return false;
    return values[field].trim() !== start[field].trim();
  });
}

/** Splits an ActionResult's fieldErrors into messages shown next to fields and the rest (shown at form level). */
export function splitFieldErrors(fieldErrors: Record<string, string> | undefined): {
  fields: Partial<Record<IncomeField, string>>;
  other: string[];
} {
  const fields: Partial<Record<IncomeField, string>> = {};
  const other: string[] = [];
  for (const [key, message] of Object.entries(fieldErrors ?? {})) {
    if ((INCOME_FIELDS as readonly string[]).includes(key)) fields[key as IncomeField] = message;
    else if (!other.includes(message)) other.push(message);
  }
  return { fields, other };
}

/** Optional text as the action expects it: blank becomes undefined (the server stores null). */
export function optionalInput(value: string): string | undefined {
  return value.trim() === "" ? undefined : value;
}
