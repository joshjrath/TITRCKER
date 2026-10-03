"use client";

import { useId } from "react";
import { Field, TextInput, Textarea } from "@/components/ui";
import { TEXT_LIMITS } from "@/lib/validation/limits";
import type { IncomeField, IncomeFormValues } from "./form-state";

export interface IncomeDetailsFieldsProps {
  values: Pick<IncomeFormValues, "source" | "category" | "note">;
  errors: Partial<Record<IncomeField, string>>;
  categories: readonly string[];
  disabled?: boolean;
  onChange: (field: "source" | "category" | "note", value: string) => void;
  /** Two columns for source + category from 640px (roomy layouts). */
  twoColumn?: boolean;
}

/** The optional part of the income form: payer/source, category (with suggestions) and a short note. */
export function IncomeDetailsFields({ values, errors, categories, disabled, onChange, twoColumn = false }: IncomeDetailsFieldsProps) {
  const listId = `cat${useId().replace(/:/g, "")}`;
  return (
    <div className="flex flex-col gap-4">
      <div className={twoColumn ? "grid gap-4 sm:grid-cols-2" : "flex flex-col gap-4"}>
        <Field label="Payer or source" showOptional error={errors.source}>
          <TextInput
            name="source"
            value={values.source}
            maxLength={TEXT_LIMITS.source}
            placeholder="e.g. Employer, client"
            autoComplete="off"
            disabled={disabled}
            onChange={(e) => onChange("source", e.target.value)}
          />
        </Field>
        <Field label="Category" showOptional error={errors.category}>
          <TextInput
            name="category"
            value={values.category}
            maxLength={TEXT_LIMITS.category}
            placeholder="e.g. Salary, Freelance, Gift"
            autoComplete="off"
            list={categories.length > 0 ? listId : undefined}
            disabled={disabled}
            onChange={(e) => onChange("category", e.target.value)}
          />
        </Field>
        {categories.length > 0 ? (
          <datalist id={listId}>
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        ) : null}
      </div>
      <Field label="Note" showOptional error={errors.note}>
        <Textarea
          name="note"
          value={values.note}
          maxLength={TEXT_LIMITS.note}
          rows={2}
          disabled={disabled}
          onChange={(e) => onChange("note", e.target.value)}
        />
      </Field>
    </div>
  );
}
