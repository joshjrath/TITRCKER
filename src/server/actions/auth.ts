"use server";

import "server-only";

import { isAPIError } from "better-auth/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import type { ActionResult } from "@/lib/action-result";
import { rateLimitedResult, unauthorizedResult, validationResult } from "@/server/auth/action-results";
import { getAuth } from "@/server/auth/auth";
import { getOwnerSetupToken } from "@/server/auth/config";
import { createOwnerAccount, ownerExists } from "@/server/auth/owner";
import { changePasswordSchema, fieldErrorsFrom, ownerSetupSchema, type ChangePasswordInput, type OwnerSetupInput } from "@/server/auth/schemas";
import { getOwner } from "@/server/auth/session";
import { logEvent } from "@/server/log";
import { requestClientIp } from "@/server/security/client-ip";
import { checkRateLimit, RATE_LIMITS } from "@/server/security/rate-limit";
import { constantTimeEqual } from "@/server/security/tokens";

/**
 * One-time owner setup (the /setup page). Works only while no user exists and OWNER_SETUP_TOKEN is configured.
 * On success it redirects to /sign-in with a notice; otherwise it returns an ActionResult describing the problem.
 */
export async function setupOwnerAction(input: OwnerSetupInput): Promise<ActionResult<never>> {
  const expectedToken = getOwnerSetupToken();
  if (!expectedToken || (await ownerExists())) {
    return { ok: false, code: "not_found", message: "Setup is not available." };
  }

  // Per IP, plus a deployment-wide ceiling: the client IP comes from a spoofable header (see client-ip.ts).
  const ip = requestClientIp(await headers());
  const limit = await checkRateLimit(`setup:${ip}`, RATE_LIMITS.setup);
  if (!limit.ok) return rateLimitedResult(limit.retryAfterSeconds);
  const globalLimit = await checkRateLimit("setup-global:all", RATE_LIMITS.setupGlobal);
  if (!globalLimit.ok) return rateLimitedResult(globalLimit.retryAfterSeconds);

  const parsed = ownerSetupSchema.safeParse(input);
  if (!parsed.success) {
    return validationResult(fieldErrorsFrom(parsed.error));
  }
  if (!constantTimeEqual(parsed.data.token, expectedToken)) {
    logEvent("warn", "auth.setup_bad_token", {});
    return validationResult({ token: "The setup token is not correct." });
  }

  const created = await createOwnerAccount({
    email: parsed.data.email,
    name: parsed.data.name,
    password: parsed.data.password,
  });
  if (!created.ok) {
    switch (created.code) {
      case "invalid_input":
      case "email_not_allowed":
        return validationResult(created.fieldErrors ?? { email: created.message });
      case "owner_exists":
        return { ok: false, code: "conflict", message: "The owner account already exists. Sign in instead." };
      default:
        return { ok: false, code: "server_error", message: "The owner account could not be created. Try again." };
    }
  }
  redirect("/sign-in?setup=done");
}

/** Signs the owner out (revokes the session server-side and clears the cookie) and returns to /sign-in. */
export async function signOutAction(): Promise<never> {
  try {
    await getAuth().api.signOut({ headers: await headers() });
  } catch (error) {
    // An already-invalid session is fine: the cookie is cleared either way.
    if (!isAPIError(error)) logEvent("error", "auth.sign_out_failed", { error: error instanceof Error ? error.name : "unknown" });
  }
  redirect("/sign-in");
}

/**
 * Changes the owner's password after re-checking the current one.
 * revokeOtherSessions (default true) signs out every other device and issues this browser a fresh session.
 */
export async function changePasswordAction(input: ChangePasswordInput): Promise<ActionResult<{ otherSessionsRevoked: boolean }>> {
  const owner = await getOwner();
  if (!owner) return unauthorizedResult();

  const limit = await checkRateLimit(`security:${owner.ownerId}`, RATE_LIMITS.security);
  if (!limit.ok) return rateLimitedResult(limit.retryAfterSeconds);

  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) {
    return validationResult(fieldErrorsFrom(parsed.error));
  }
  const { currentPassword, newPassword, revokeOtherSessions } = parsed.data;
  try {
    await getAuth().api.changePassword({
      headers: await headers(),
      body: { currentPassword, newPassword, revokeOtherSessions },
    });
  } catch (error) {
    if (isAPIError(error)) {
      const code = (error.body as { code?: string } | undefined)?.code;
      if (code === "INVALID_PASSWORD") {
        return validationResult({ currentPassword: "Current password is incorrect." });
      }
      if (code === "PASSWORD_TOO_SHORT" || code === "PASSWORD_TOO_LONG") {
        return validationResult({ newPassword: "Choose a password of 12 to 128 characters." });
      }
      if (error.statusCode === 401) return unauthorizedResult();
    }
    logEvent("error", "auth.change_password_failed", { ownerId: owner.ownerId, error: error instanceof Error ? error.name : "unknown" });
    return { ok: false, code: "server_error", message: "Your password could not be changed. Try again." };
  }
  logEvent("info", "auth.password_changed", { ownerId: owner.ownerId, revokeOtherSessions });
  return {
    ok: true,
    data: { otherSessionsRevoked: revokeOtherSessions },
    message: revokeOtherSessions ? "Password changed. Other devices were signed out." : "Password changed.",
  };
}
