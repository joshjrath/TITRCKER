"use server";

import "server-only";

import type { ActionResult } from "@/lib/action-result";
import {
  openingCreateSchema,
  openingDeleteSchema,
  openingUpdateSchema,
  type OpeningCreateInput,
  type OpeningDeleteInput,
  type OpeningUpdateInput,
} from "@/lib/validation";
import type { IdResult } from "@/lib/view-models";
import { createOpening, deleteOpening, OPENING_OPERATIONS, updateOpening } from "@/server/services/opening";

import { runOwnerAction } from "./run-action";

export async function createOpeningObligationAction(input: OpeningCreateInput): Promise<ActionResult<IdResult>> {
  return runOwnerAction(
    {
      operation: OPENING_OPERATIONS.create,
      schema: openingCreateSchema,
      run: createOpening,
      successMessage: "Opening balance added.",
    },
    input,
  );
}

export async function updateOpeningObligationAction(input: OpeningUpdateInput): Promise<ActionResult<IdResult>> {
  return runOwnerAction(
    {
      operation: OPENING_OPERATIONS.update,
      schema: openingUpdateSchema,
      run: updateOpening,
      successMessage: "Opening balance updated.",
    },
    input,
  );
}

export async function deleteOpeningObligationAction(input: OpeningDeleteInput): Promise<ActionResult<IdResult>> {
  return runOwnerAction(
    {
      operation: OPENING_OPERATIONS.delete,
      schema: openingDeleteSchema,
      run: deleteOpening,
      successMessage: "Opening balance removed.",
    },
    input,
  );
}
