"use server";

import "server-only";

import type { ActionResult } from "@/lib/action-result";
import { settingsUpdateSchema, type SettingsUpdateInput } from "@/lib/validation";
import type { SettingsVM } from "@/lib/view-models";
import { SETTINGS_OPERATIONS, updateSettings } from "@/server/services/settings-update";

import { runOwnerAction } from "./run-action";

export async function updateSettingsAction(input: SettingsUpdateInput): Promise<ActionResult<SettingsVM>> {
  return runOwnerAction(
    {
      operation: SETTINGS_OPERATIONS.update,
      schema: settingsUpdateSchema,
      run: updateSettings,
      successMessage: "Settings saved.",
    },
    input,
  );
}
