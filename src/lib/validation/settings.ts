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

const UTC_ZONE = "UTC";
const TIME_ZONE_ERROR = "Choose a time zone from the list.";

let canonicalZones: Map<string, string> | undefined;

/**
 * Lower-cased name -> canonical spelling for every zone the settings list offers: the runtime's canonical IANA zones
 * (`Intl.supportedValuesOf('timeZone')`) plus UTC. Aliases ("US/Eastern"), abbreviations ("EST"), `Etc/GMT±N` and
 * fixed offsets are not in it, so they are rejected rather than silently mapped to another zone.
 */
function canonicalTimeZoneNames(): Map<string, string> {
  if (!canonicalZones) {
    const zones = [...Intl.supportedValuesOf("timeZone"), UTC_ZONE].filter((zone) => isValidTimeZone(zone));
    canonicalZones = new Map(zones.map((zone) => [zone.toLowerCase(), zone]));
  }
  return canonicalZones;
}

/** The canonical spelling of `timeZone` ("america/toronto" -> "America/Toronto"), or null when it is not offered. */
export function canonicalTimeZone(timeZone: string): string | null {
  return canonicalTimeZoneNames().get(timeZone.toLowerCase()) ?? null;
}

export const timeZoneField = z
  .string({ error: "Choose a time zone." })
  .trim()
  .max(TEXT_LIMITS.timeZone, { error: TIME_ZONE_ERROR })
  .refine((tz) => canonicalTimeZone(tz) !== null, { error: TIME_ZONE_ERROR })
  .transform((tz) => canonicalTimeZone(tz) ?? tz);

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
