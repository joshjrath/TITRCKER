import "server-only";

import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";

import { idempotencyRecord } from "@/server/db/schema";
import type { OwnerTx } from "@/server/db/with-owner";

import { ServiceError } from "./errors";

/** Deterministic JSON: object keys sorted recursively; undefined object members dropped. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    if (value === undefined) return "null";
    if (typeof value === "bigint") return JSON.stringify(value.toString());
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

/** sha256 over the operation name and the canonical request (without the idempotency key itself). */
export function requestHash(operation: string, request: unknown): string {
  return createHash("sha256").update(operation).update("\n").update(canonicalJson(request)).digest("hex");
}

export interface IdempotentRequest {
  key: string;
  operation: string;
  /** The validated request payload (excluding the key). */
  request: unknown;
}

/**
 * ARCHITECTURE §6 steps 2 and 5. Must run inside withOwnerLocked (the settings lock serializes the owner's
 * writes, so a concurrent duplicate waits for the first transaction and then sees its stored response).
 *
 * - New key: runs `fn`, stores its (JSON-serializable) result as the response, returns it.
 * - Same key, same operation + request hash: returns the stored response without running `fn` again.
 * - Same key, different payload or operation: throws `idempotency_conflict`.
 *
 * If `fn` throws, the whole transaction (including the key) rolls back, so a retry runs again.
 */
export async function withIdempotency<T>(
  tx: OwnerTx,
  ownerId: string,
  req: IdempotentRequest,
  fn: () => Promise<T>,
): Promise<T> {
  const hash = requestHash(req.operation, req.request);
  const inserted = await tx
    .insert(idempotencyRecord)
    .values({ ownerId, key: req.key, operation: req.operation, requestHash: hash })
    .onConflictDoNothing({ target: [idempotencyRecord.ownerId, idempotencyRecord.key] })
    .returning({ key: idempotencyRecord.key });

  if (inserted.length === 0) {
    const [existing] = await tx
      .select({
        operation: idempotencyRecord.operation,
        requestHash: idempotencyRecord.requestHash,
        response: idempotencyRecord.response,
      })
      .from(idempotencyRecord)
      .where(and(eq(idempotencyRecord.ownerId, ownerId), eq(idempotencyRecord.key, req.key)));
    if (!existing || existing.operation !== req.operation || existing.requestHash !== hash) {
      throw new ServiceError(
        "idempotency_conflict",
        "This form was already submitted with different details. Reload the page and try again.",
      );
    }
    if (existing.response === null) {
      throw new ServiceError("conflict", "This request is still being processed. Please try again in a moment.");
    }
    return existing.response as T;
  }

  const result = await fn();
  await tx
    .update(idempotencyRecord)
    .set({ response: JSON.parse(JSON.stringify(result ?? null)) as unknown })
    .where(and(eq(idempotencyRecord.ownerId, ownerId), eq(idempotencyRecord.key, req.key)));
  return result;
}
