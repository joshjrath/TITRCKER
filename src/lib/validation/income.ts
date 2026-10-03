import { z } from "zod";

import {
  amountField,
  currencyField,
  idempotencyKeyField,
  expectedVersionField,
  localDateField,
  optionalText,
  recordIdField,
  requiredText,
} from "./fields";

export const ADJUSTMENT_KIND_VALUES = ["refund", "correction"] as const;

const incomeFields = {
  amount: amountField,
  currency: currencyField,
  receivedOn: localDateField,
  source: optionalText({ field: "source", label: "Source" }),
  category: optionalText({ field: "category", label: "Category" }),
  note: optionalText({ field: "note", label: "Note", multiline: true }),
};

const deleteReason = optionalText({ field: "reason", label: "Reason" });

export const incomeCreateSchema = z.object({ idempotencyKey: idempotencyKeyField, ...incomeFields });

export const incomeUpdateSchema = z.object({
  idempotencyKey: idempotencyKeyField,
  id: recordIdField,
  expectedVersion: expectedVersionField,
  ...incomeFields,
});

export const incomeDeleteSchema = z.object({ idempotencyKey: idempotencyKeyField, id: recordIdField, reason: deleteReason });

export const incomeRestoreSchema = z.object({ idempotencyKey: idempotencyKeyField, id: recordIdField });

export const adjustmentCreateSchema = z.object({
  idempotencyKey: idempotencyKeyField,
  incomeId: recordIdField,
  kind: z.enum(ADJUSTMENT_KIND_VALUES, { error: "Choose refund or correction." }),
  amount: amountField,
  effectiveOn: localDateField,
  reason: requiredText({ field: "reason", label: "Reason" }),
});

export const adjustmentDeleteSchema = z.object({
  idempotencyKey: idempotencyKeyField,
  id: recordIdField,
  reason: deleteReason,
});

export type IncomeCreateInput = z.input<typeof incomeCreateSchema>;
export type IncomeCreateData = z.output<typeof incomeCreateSchema>;
export type IncomeUpdateInput = z.input<typeof incomeUpdateSchema>;
export type IncomeUpdateData = z.output<typeof incomeUpdateSchema>;
export type IncomeDeleteInput = z.input<typeof incomeDeleteSchema>;
export type IncomeDeleteData = z.output<typeof incomeDeleteSchema>;
export type IncomeRestoreInput = z.input<typeof incomeRestoreSchema>;
export type IncomeRestoreData = z.output<typeof incomeRestoreSchema>;
export type AdjustmentCreateInput = z.input<typeof adjustmentCreateSchema>;
export type AdjustmentCreateData = z.output<typeof adjustmentCreateSchema>;
export type AdjustmentDeleteInput = z.input<typeof adjustmentDeleteSchema>;
export type AdjustmentDeleteData = z.output<typeof adjustmentDeleteSchema>;
