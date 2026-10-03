import { z } from "zod";

import { isValidTimeZone } from "@/domain";

import {
  currencyField,
  expectedVersionField,
  idempotencyKeyField,
  localDateField,
  optionalText,
} from "./fields";
import { TEXT_LIMITS } from "./limits";

export const timeZoneField = z
  .string({ error: "Choose a time zone." })
  .trim()
  .max(TEXT_LIMITS.timeZone, { error: "Choose a time zone from the list." })
  .refine((tz) => isValidTimeZone(tz), { error: "Choose a time zone from the list." });

export const settingsUpdateSchema = z.object({
  idempotencyKey: idempotencyKeyField,
  expectedVersion: expectedVersionField,
  trackingStart: localDateField,
  timeZone: timeZoneField,
  displayCurrency: currencyField,
  /** Optional default church name; blank clears it. */
  churchName: optionalText({ field: "churchName", label: "Church name" }),
  nextPayoutDate: localDateField,
});

export type SettingsUpdateInput = z.input<typeof settingsUpdateSchema>;
export type SettingsUpdateData = z.output<typeof settingsUpdateSchema>;
