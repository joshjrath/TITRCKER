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

/**
 * What `idempotency_record.response` holds: the operation's result wrapped, so a `null` result is distinguishable from
 * "no response stored yet" and an `undefined` result (no `value` member) survives the JSON round trip.
 * Rows written before the wrapper existed hold the bare result and are returned as they are.
 */
interface StoredResponse {
  v: 1;
  value?: unknown;
}

function wrapResponse(result: unknown): StoredResponse {
  return JSON.parse(JSON.stringify({ v: 1, value: result })) as StoredResponse;
}

function isStoredResponse(stored: unknown): stored is StoredResponse {
  if (typeof stored !== "object" || stored === null || Array.isArray(stored)) return false;
  const keys = Object.keys(stored);
  return (stored as { v?: unknown }).v === 1 && keys.every((k) => k === "v" || k === "value");
}

function unwrapResponse(stored: unknown): unknown {
  return isStoredResponse(stored) ? stored.value : stored;
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
 * - Same key, same operation + request hash: returns the stored response without running `fn` again (including a
 *   `null` or `undefined` result).
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
    return unwrapResponse(existing.response) as T;
  }

  const result = await fn();
  await tx
    .update(idempotencyRecord)
    .set({ response: wrapResponse(result) })
    .where(and(eq(idempotencyRecord.ownerId, ownerId), eq(idempotencyRecord.key, req.key)));
  return result;
}
