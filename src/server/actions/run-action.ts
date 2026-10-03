import "server-only";

import { revalidatePath } from "next/cache";
import type { z } from "zod";

import type { ActionResult } from "@/lib/action-result";
import { parseWith } from "@/lib/validation/parse";
import { getOwner } from "@/server/auth/session";
import { now } from "@/server/clock";
import { checkRateLimit, RATE_LIMITS } from "@/server/security/rate-limit";
import type { ServiceContext } from "@/server/services/context";
import { toActionError, VALIDATION_MESSAGE } from "@/server/services/errors";

// Shared pipeline for the financial Server Actions. Deliberately NOT a "use server" module: only the thin
// wrappers in income.ts / payments.ts / ... are callable from the client.

type Failure = Extract<ActionResult<never>, { ok: false }>;

const UNAUTHORIZED: Failure = { ok: false, code: "unauthorized", message: "Your session has ended. Sign in again." };

function rateLimited(retryAfterSeconds: number): Failure {
  const wait = retryAfterSeconds < 60 ? `${retryAfterSeconds} seconds` : `${Math.ceil(retryAfterSeconds / 60)} minutes`;
  return { ok: false, code: "rate_limited", message: `Too many changes in a short time. Try again in ${wait}.` };
}

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
    if (!owner) return UNAUTHORIZED;

    const limit = await checkRateLimit(`mutation:${owner.ownerId}`, RATE_LIMITS.mutation);
    if (!limit.ok) return rateLimited(limit.retryAfterSeconds);

    const parsed = parseWith(spec.schema, input);
    if (!parsed.ok) return { ok: false, code: "validation", message: VALIDATION_MESSAGE, fieldErrors: parsed.fieldErrors };

    const data = await spec.run({ ownerId: owner.ownerId, now: now() }, input as z.input<S>);
    revalidatePath("/", "layout");
    const message = typeof spec.successMessage === "function" ? spec.successMessage(data) : spec.successMessage;
    return { ok: true, data, message };
  } catch (err) {
    return toActionError(err, spec.operation);
  }
}
