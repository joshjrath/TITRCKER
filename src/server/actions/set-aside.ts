"use server";

import "server-only";

import type { ActionResult } from "@/lib/action-result";
import {
  setAsideCreateSchema,
  setAsideDeleteSchema,
  type SetAsideCreateInput,
  type SetAsideDeleteInput,
} from "@/lib/validation";
import type { IdResult } from "@/lib/view-models";
import { createSetAside, deleteSetAside, SET_ASIDE_OPERATIONS } from "@/server/services/set-aside";

import { runOwnerAction } from "./run-action";

export async function createSetAsideAction(input: SetAsideCreateInput): Promise<ActionResult<IdResult>> {
  return runOwnerAction(
    {
      operation: SET_ASIDE_OPERATIONS.create,
      schema: setAsideCreateSchema,
      run: createSetAside,
      successMessage: "Set-aside entry recorded.",
    },
    input,
  );
}

export async function deleteSetAsideAction(input: SetAsideDeleteInput): Promise<ActionResult<IdResult>> {
  return runOwnerAction(
    {
      operation: SET_ASIDE_OPERATIONS.delete,
      schema: setAsideDeleteSchema,
      run: deleteSetAside,
      successMessage: "Entry removed.",
    },
    input,
  );
}
