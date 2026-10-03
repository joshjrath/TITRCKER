import { z } from "zod";

import {
  amountField,
  currencyField,
  expectedVersionField,
  idempotencyKeyField,
  localDateField,
  optionalText,
  recordIdField,
} from "./fields";
import { DEFAULT_OPENING_LABEL } from "./limits";

const openingFields = {
  amount: amountField,
  currency: currencyField,
  effectiveOn: localDateField,
  /** Blank or missing becomes "Opening balance". */
  label: optionalText({ field: "label", label: "Label" }).transform((v): string => v ?? DEFAULT_OPENING_LABEL),
  note: optionalText({ field: "note", label: "Note", multiline: true }),
};

export const openingCreateSchema = z.object({ idempotencyKey: idempotencyKeyField, ...openingFields });

export const openingUpdateSchema = z.object({
  idempotencyKey: idempotencyKeyField,
  id: recordIdField,
  expectedVersion: expectedVersionField,
  ...openingFields,
});

export const openingDeleteSchema = z.object({
  idempotencyKey: idempotencyKeyField,
  id: recordIdField,
  reason: optionalText({ field: "reason", label: "Reason" }),
});

export type OpeningCreateInput = z.input<typeof openingCreateSchema>;
export type OpeningCreateData = z.output<typeof openingCreateSchema>;
export type OpeningUpdateInput = z.input<typeof openingUpdateSchema>;
export type OpeningUpdateData = z.output<typeof openingUpdateSchema>;
export type OpeningDeleteInput = z.input<typeof openingDeleteSchema>;
export type OpeningDeleteData = z.output<typeof openingDeleteSchema>;
