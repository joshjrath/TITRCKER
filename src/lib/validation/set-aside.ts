import { z } from "zod";

import {
  amountField,
  currencyField,
  idempotencyKeyField,
  localDateField,
  optionalText,
  recordIdField,
} from "./fields";

export const SET_ASIDE_KIND_VALUES = ["reserve", "release"] as const;

export const setAsideCreateSchema = z.object({
  idempotencyKey: idempotencyKeyField,
  kind: z.enum(SET_ASIDE_KIND_VALUES, { error: "Choose set aside or release." }),
  amount: amountField,
  currency: currencyField,
  effectiveOn: localDateField,
  note: optionalText({ field: "note", label: "Note", multiline: true }),
});

export const setAsideDeleteSchema = z.object({
  idempotencyKey: idempotencyKeyField,
  id: recordIdField,
  reason: optionalText({ field: "reason", label: "Reason" }),
});

export type SetAsideCreateInput = z.input<typeof setAsideCreateSchema>;
export type SetAsideCreateData = z.output<typeof setAsideCreateSchema>;
export type SetAsideDeleteInput = z.input<typeof setAsideDeleteSchema>;
export type SetAsideDeleteData = z.output<typeof setAsideDeleteSchema>;
