"use server";

import "server-only";

import type { ActionResult } from "@/lib/action-result";
import {
  adjustmentCreateSchema,
  adjustmentDeleteSchema,
  incomeCreateSchema,
  incomeDeleteSchema,
  incomeRestoreSchema,
  incomeUpdateSchema,
  type AdjustmentCreateInput,
  type AdjustmentDeleteInput,
  type IncomeCreateInput,
  type IncomeDeleteInput,
  type IncomeRestoreInput,
  type IncomeUpdateInput,
} from "@/lib/validation";
import type { AdjustmentMutationResult, IdResult, IncomeMutationResult } from "@/lib/view-models";
import {
  createAdjustment,
  createIncome,
  deleteAdjustment,
  deleteIncome,
  INCOME_OPERATIONS,
  restoreIncome,
  updateIncome,
} from "@/server/services/income";

import { runOwnerAction } from "./run-action";

export async function createIncomeAction(input: IncomeCreateInput): Promise<ActionResult<IncomeMutationResult>> {
  return runOwnerAction(
    { operation: INCOME_OPERATIONS.create, schema: incomeCreateSchema, run: createIncome, successMessage: "Income added." },
    input,
  );
}

export async function updateIncomeAction(input: IncomeUpdateInput): Promise<ActionResult<IncomeMutationResult>> {
  return runOwnerAction(
    { operation: INCOME_OPERATIONS.update, schema: incomeUpdateSchema, run: updateIncome, successMessage: "Income updated." },
    input,
  );
}

export async function deleteIncomeAction(input: IncomeDeleteInput): Promise<ActionResult<IdResult>> {
  return runOwnerAction(
    { operation: INCOME_OPERATIONS.delete, schema: incomeDeleteSchema, run: deleteIncome, successMessage: "Income deleted." },
    input,
  );
}

export async function restoreIncomeAction(input: IncomeRestoreInput): Promise<ActionResult<IdResult>> {
  return runOwnerAction(
    { operation: INCOME_OPERATIONS.restore, schema: incomeRestoreSchema, run: restoreIncome, successMessage: "Income restored." },
    input,
  );
}

export async function createAdjustmentAction(
  input: AdjustmentCreateInput,
): Promise<ActionResult<AdjustmentMutationResult>> {
  return runOwnerAction(
    {
      operation: INCOME_OPERATIONS.createAdjustment,
      schema: adjustmentCreateSchema,
      run: createAdjustment,
      successMessage: "Refund recorded.",
    },
    input,
  );
}

export async function deleteAdjustmentAction(input: AdjustmentDeleteInput): Promise<ActionResult<IdResult>> {
  return runOwnerAction(
    {
      operation: INCOME_OPERATIONS.deleteAdjustment,
      schema: adjustmentDeleteSchema,
      run: deleteAdjustment,
      successMessage: "Refund removed.",
    },
    input,
  );
}
