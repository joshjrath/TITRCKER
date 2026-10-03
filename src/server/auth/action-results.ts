import "server-only";

import type { ActionResult } from "@/lib/action-result";

/** Shared ActionResult failures for the auth and two-factor Server Actions. */

export function unauthorizedResult(): Extract<ActionResult<never>, { ok: false }> {
  return { ok: false, code: "unauthorized", message: "Your session has ended. Sign in again." };
}

export function rateLimitedResult(retryAfterSeconds: number): Extract<ActionResult<never>, { ok: false }> {
  const minutes = Math.ceil(retryAfterSeconds / 60);
  const wait = retryAfterSeconds < 60 ? `${retryAfterSeconds} seconds` : `${minutes} minute${minutes === 1 ? "" : "s"}`;
  return { ok: false, code: "rate_limited", message: `Too many attempts. Try again in ${wait}.` };
}

export function validationResult(fieldErrors: Record<string, string>): Extract<ActionResult<never>, { ok: false }> {
  return { ok: false, code: "validation", message: "Check the highlighted fields.", fieldErrors };
}
