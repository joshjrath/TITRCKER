import "server-only";

import { revalidatePath } from "next/cache";
import type { z } from "zod";

import type { ActionResult } from "@/lib/action-result";
import { parseWith } from "@/lib/validation/parse";
import { getOwner } from "@/server/auth/session";
import { now } from "@/server/clock";
import { checkRateLimit, RATE_LIMITS } from "@/server/security/rate-limit";
import type { ServiceContext } from "@/server/services/context";
import { toActionError } from "@/server/services/errors";

import { rateLimitedResult, unauthorizedResult, validationResult } from "./failures";

// Shared pipeline for the financial Server Actions. Deliberately NOT a "use server" module: only the thin
// wrappers in income.ts / payments.ts / ... are callable from the client.

export interface OwnerActionSpec<S extends z.ZodType, T> {
  /** Operation name for logs (never includes input data). */
  operation: string;
  /** The shared zod schema (re-checked by the service as well). */
  schema: S;
  /** The service call; receives the server-side context and the raw (already schema-checked) input. */
  run: (ctx: ServiceContext, input: z.input<S>) => Promise<T>;
  successMessage: string | ((data: T) => string);
}

/**
 * auth (session owner) -> rate limit `mutation:<ownerId>` -> zod safeParse -> service({ ownerId, now }) ->
 * revalidatePath('/', 'layout') -> ActionResult. ServiceErrors keep their code/message; anything unexpected becomes
 * a generic `server_error` with a safe log line (operation + error class only, never input data).
 */
export async function runOwnerAction<S extends z.ZodType, T>(
  spec: OwnerActionSpec<S, T>,
  input: unknown,
): Promise<ActionResult<T>> {
  try {
    const owner = await getOwner();
    if (!owner) return unauthorizedResult();

    const limit = await checkRateLimit(`mutation:${owner.ownerId}`, RATE_LIMITS.mutation);
    if (!limit.ok) return rateLimitedResult(limit.retryAfterSeconds, "Too many changes in a short time.");

    const parsed = parseWith(spec.schema, input);
    if (!parsed.ok) return validationResult(parsed.fieldErrors);

    const data = await spec.run({ ownerId: owner.ownerId, now: now() }, input as z.input<S>);
    revalidatePath("/", "layout");
    const message = typeof spec.successMessage === "function" ? spec.successMessage(data) : spec.successMessage;
    return { ok: true, data, message };
  } catch (err) {
    return toActionError(err, spec.operation);
  }
}
