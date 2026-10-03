"use server";

import "server-only";

import { isAPIError } from "better-auth/api";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { renderSVG } from "uqr";

import type { ActionResult } from "@/lib/action-result";
import { rateLimitedResult, unauthorizedResult, validationResult } from "./failures";
import { getAuth } from "@/server/auth/auth";
import {
  fieldErrorsFrom,
  passwordConfirmSchema,
  totpCodeSchema,
  type PasswordConfirmInput,
  type TotpCodeInput,
} from "@/server/auth/schemas";
import { getOwner, type OwnerContext } from "@/server/auth/session";
import { logEvent } from "@/server/log";
import { checkRateLimit, RATE_LIMITS } from "@/server/security/rate-limit";

/**
 * Two-factor (TOTP + backup codes) management for the signed-in owner, backed by Better Auth's twoFactor plugin.
 * Secrets, URIs and backup codes are returned to the caller only and never logged.
 */

export interface TwoFactorEnrollment {
  /** otpauth:// URI for manual entry. */
  totpUri: string;
  /** QR code of the URI as a data: URI (allowed by the CSP's img-src data:). */
  qrSvgDataUri: string;
  backupCodes: string[];
}

type Failure = Extract<ActionResult<never>, { ok: false }>;

async function authorize(): Promise<{ owner: OwnerContext } | { failure: Failure }> {
  const owner = await getOwner();
  if (!owner) return { failure: unauthorizedResult() };
  const limit = await checkRateLimit(`2fa:${owner.ownerId}`, RATE_LIMITS.security);
  if (!limit.ok) return { failure: rateLimitedResult(limit.retryAfterSeconds) };
  return { owner };
}

function errorCode(error: unknown): string | undefined {
  return isAPIError(error) ? (error.body as { code?: string } | undefined)?.code : undefined;
}

/** Maps Better Auth errors shared by the password-confirmed operations; null when unrecognised. */
function mapCommonError(error: unknown): Failure | null {
  const code = errorCode(error);
  if (code === "INVALID_PASSWORD") return validationResult({ password: "Password is incorrect." });
  if (code === "TWO_FACTOR_NOT_ENABLED" || code === "TOTP_NOT_ENABLED") {
    return { ok: false, code: "conflict", message: "Two-factor authentication is not turned on." };
  }
  if (isAPIError(error) && error.statusCode === 401 && code === "UNAUTHORIZED") return unauthorizedResult();
  return null;
}

function serverError(event: string, ownerId: string, error: unknown): Failure {
  logEvent("error", event, { ownerId, error: error instanceof Error ? error.name : "unknown", code: errorCode(error) ?? null });
  return { ok: false, code: "server_error", message: "Something went wrong. Try again." };
}

function qrDataUri(uri: string): string {
  const svg = renderSVG(uri, { ecc: "M", border: 2 });
  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}

/** Step 1: confirm the password, create a (not yet active) TOTP secret and backup codes. */
export async function startTwoFactorEnrollment(input: PasswordConfirmInput): Promise<ActionResult<TwoFactorEnrollment>> {
  const auth = await authorize();
  if ("failure" in auth) return auth.failure;
  const parsed = passwordConfirmSchema.safeParse(input);
  if (!parsed.success) return validationResult(fieldErrorsFrom(parsed.error));
  try {
    const result = await getAuth().api.enableTwoFactor({
      headers: await headers(),
      body: { password: parsed.data.password },
    });
    if (result.method !== "totp" || !("totpURI" in result) || !result.totpURI || !result.backupCodes) {
      return serverError("auth.2fa_enroll_unexpected", auth.owner.ownerId, null);
    }
    logEvent("info", "auth.2fa_enroll_started", { ownerId: auth.owner.ownerId });
    return {
      ok: true,
      data: { totpUri: result.totpURI, qrSvgDataUri: qrDataUri(result.totpURI), backupCodes: result.backupCodes },
      message: "Scan the QR code, then enter the 6-digit code to finish.",
    };
  } catch (error) {
    if (errorCode(error) === "TOTP_ALREADY_ENABLED") {
      return { ok: false, code: "conflict", message: "Two-factor authentication is already on." };
    }
    return mapCommonError(error) ?? serverError("auth.2fa_enroll_failed", auth.owner.ownerId, error);
  }
}

/** Step 2: verify a code from the authenticator app; this activates two-factor sign-in. */
export async function confirmTwoFactor(input: TotpCodeInput): Promise<ActionResult<{ enabled: true }>> {
  const auth = await authorize();
  if ("failure" in auth) return auth.failure;
  const parsed = totpCodeSchema.safeParse(input);
  if (!parsed.success) return validationResult(fieldErrorsFrom(parsed.error));
  try {
    await getAuth().api.verifyTOTP({ headers: await headers(), body: { code: parsed.data.code } });
  } catch (error) {
    if (errorCode(error) === "INVALID_CODE") return validationResult({ code: "That code is not correct. Check the time on your phone and try again." });
    return mapCommonError(error) ?? serverError("auth.2fa_confirm_failed", auth.owner.ownerId, error);
  }
  logEvent("info", "auth.2fa_enabled", { ownerId: auth.owner.ownerId });
  revalidatePath("/", "layout");
  return { ok: true, data: { enabled: true }, message: "Two-factor authentication is on." };
}

/** Turns two-factor off after confirming the password (also forgets trusted devices for this browser). */
export async function disableTwoFactor(input: PasswordConfirmInput): Promise<ActionResult<{ enabled: false }>> {
  const auth = await authorize();
  if ("failure" in auth) return auth.failure;
  const parsed = passwordConfirmSchema.safeParse(input);
  if (!parsed.success) return validationResult(fieldErrorsFrom(parsed.error));
  try {
    await getAuth().api.disableTwoFactor({ headers: await headers(), body: { password: parsed.data.password } });
  } catch (error) {
    return mapCommonError(error) ?? serverError("auth.2fa_disable_failed", auth.owner.ownerId, error);
  }
  logEvent("info", "auth.2fa_disabled", { ownerId: auth.owner.ownerId });
  revalidatePath("/", "layout");
  return { ok: true, data: { enabled: false }, message: "Two-factor authentication is off." };
}

/** Replaces all backup codes (old ones stop working) after confirming the password. */
export async function regenerateBackupCodes(input: PasswordConfirmInput): Promise<ActionResult<{ backupCodes: string[] }>> {
  const auth = await authorize();
  if ("failure" in auth) return auth.failure;
  const parsed = passwordConfirmSchema.safeParse(input);
  if (!parsed.success) return validationResult(fieldErrorsFrom(parsed.error));
  try {
    const result = await getAuth().api.generateBackupCodes({
      headers: await headers(),
      body: { password: parsed.data.password },
    });
    logEvent("info", "auth.2fa_backup_codes_regenerated", { ownerId: auth.owner.ownerId });
    return { ok: true, data: { backupCodes: result.backupCodes }, message: "New backup codes created. The old ones no longer work." };
  } catch (error) {
    return mapCommonError(error) ?? serverError("auth.2fa_backup_codes_failed", auth.owner.ownerId, error);
  }
}
