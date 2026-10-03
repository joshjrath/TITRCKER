"use server";

import "server-only";

import type { ActionResult } from "@/lib/action-result";
import {
  paymentDetailsUpdateSchema,
  paymentRecordSchema,
  paymentReverseSchema,
  type PaymentDetailsUpdateInput,
  type PaymentRecordInput,
  type PaymentReverseInput,
} from "@/lib/validation";
import type { IdResult, PaymentMutationResult } from "@/lib/view-models";
import { PAYMENT_OPERATIONS, recordPayment, reversePayment, updatePaymentDetails } from "@/server/services/payments";

import { runOwnerAction } from "./run-action";

export async function recordPaymentAction(input: PaymentRecordInput): Promise<ActionResult<PaymentMutationResult>> {
  return runOwnerAction(
    {
      operation: PAYMENT_OPERATIONS.record,
      schema: paymentRecordSchema,
      run: recordPayment,
      successMessage: "Payment recorded.",
    },
    input,
  );
}

export async function reversePaymentAction(input: PaymentReverseInput): Promise<ActionResult<IdResult>> {
  return runOwnerAction(
    {
      operation: PAYMENT_OPERATIONS.reverse,
      schema: paymentReverseSchema,
      run: reversePayment,
      successMessage: "Payment reversed.",
    },
    input,
  );
}

export async function updatePaymentDetailsAction(input: PaymentDetailsUpdateInput): Promise<ActionResult<IdResult>> {
  return runOwnerAction(
    {
      operation: PAYMENT_OPERATIONS.updateDetails,
      schema: paymentDetailsUpdateSchema,
      run: updatePaymentDetails,
      successMessage: "Payment details saved.",
    },
    input,
  );
}
