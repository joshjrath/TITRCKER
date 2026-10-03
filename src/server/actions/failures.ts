import "server-only";

import type { ActionResult } from "@/lib/action-result";
import { VALIDATION_MESSAGE } from "@/server/services/errors";

// Shared ActionResult failures for every Server Action (financial, auth and two-factor). Deliberately NOT a
// "use server" module.

export type ActionFailure = Extract<ActionResult<never>, { ok: false }>;

const SECONDS_PER_MINUTE = 60;

export function unauthorizedResult(): ActionFailure {
  return { ok: false, code: "unauthorized", message: "Your session has ended. Sign in again." };
}

/** `lead` names what was limited, e.g. "Too many changes in a short time." */
export function rateLimitedResult(retryAfterSeconds: number, lead = "Too many attempts."): ActionFailure {
  const minutes = Math.ceil(retryAfterSeconds / SECONDS_PER_MINUTE);
  const wait =
    retryAfterSeconds < SECONDS_PER_MINUTE ? `${retryAfterSeconds} seconds` : `${minutes} minute${minutes === 1 ? "" : "s"}`;
  return { ok: false, code: "rate_limited", message: `${lead} Try again in ${wait}.` };
}

export function validationResult(fieldErrors: Record<string, string>): ActionFailure {
  return { ok: false, code: "validation", message: VALIDATION_MESSAGE, fieldErrors };
}
