import { z } from "zod";

import { MAX_SUPPORTED_YEAR, MIN_SUPPORTED_YEAR } from "@/domain";

import {
  amountField,
  bucketYearField,
  checkboxField,
  currencyField,
  expectedVersionField,
  idempotencyKeyField,
  localDateField,
  optionalText,
  recordIdField,
  requiredText,
} from "./fields";

export const allocationInputSchema = z.object({ bucketYear: bucketYearField, amount: amountField });

const MAX_ALLOCATIONS = MAX_SUPPORTED_YEAR - MIN_SUPPORTED_YEAR + 1;

/** `'auto'` = oldest outstanding period first (computed on the server at save time). */
export const allocationsField = z.union([
  z.literal("auto"),
  z
    .array(allocationInputSchema, { error: "Choose how to split this payment." })
    .max(MAX_ALLOCATIONS)
    .superRefine((items, ctx) => {
      const seen = new Set<number>();
      items.forEach((item, index) => {
        if (seen.has(item.bucketYear)) {
          ctx.addIssue({ code: "custom", path: [index, "bucketYear"], message: "Each period can appear only once." });
        }
        seen.add(item.bucketYear);
      });
    }),
]);

const churchName = requiredText({ field: "churchName", label: "Church name" });
const reference = optionalText({ field: "reference", label: "Reference" });
const note = optionalText({ field: "note", label: "Note", multiline: true });

export const paymentRecordSchema = z.object({
  idempotencyKey: idempotencyKeyField,
  amount: amountField,
  currency: currencyField,
  paidOn: localDateField,
  churchName,
  reference,
  note,
  allocations: allocationsField,
  confirmCredit: checkboxField,
  confirmMadePayment: checkboxField.refine((v) => v, { error: 'Tick "I made this payment" to record it.' }),
  drawFromSetAside: checkboxField,
});

export const paymentReverseSchema = z.object({
  idempotencyKey: idempotencyKeyField,
  id: recordIdField,
  reason: requiredText({ field: "reason", label: "Reason" }),
});

export const paymentDetailsUpdateSchema = z.object({
  idempotencyKey: idempotencyKeyField,
  id: recordIdField,
  expectedVersion: expectedVersionField,
  churchName,
  reference,
  note,
});

export type AllocationInput = z.input<typeof allocationInputSchema>;
export type PaymentRecordInput = z.input<typeof paymentRecordSchema>;
export type PaymentRecordData = z.output<typeof paymentRecordSchema>;
export type PaymentReverseInput = z.input<typeof paymentReverseSchema>;
export type PaymentReverseData = z.output<typeof paymentReverseSchema>;
export type PaymentDetailsUpdateInput = z.input<typeof paymentDetailsUpdateSchema>;
export type PaymentDetailsUpdateData = z.output<typeof paymentDetailsUpdateSchema>;
