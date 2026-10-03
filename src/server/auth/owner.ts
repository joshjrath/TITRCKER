import "server-only";

import { isAPIError } from "better-auth/api";

import { getPool } from "@/server/db/client";
import { logEvent } from "@/server/log";

import { getAuth, OWNER_ONLY_ERROR } from "./auth";
import { getOwnerEmail } from "./config";
import { ownerExists } from "./owner-exists";
import { fieldErrorsFrom, ownerAccountSchema, type OwnerAccountInput } from "./schemas";

/**
 * Owner bootstrap. Sign-up is disabled in Better Auth, so the single owner is created server-side through Better
 * Auth's own internal adapter: `ctx.password.hash` (scrypt, the same hasher sign-in verifies against),
 * `internalAdapter.createUser` (runs the owner-only databaseHooks) and `internalAdapter.linkAccount` with
 * providerId "credential" (exactly what /sign-up/email would write). Used by the CLI (scripts/create-owner.ts)
 * and the one-time /setup page.
 */

export { ownerExists };

export type CreateOwnerErrorCode =
  | "invalid_input"
  | "owner_email_not_configured"
  | "email_not_allowed"
  | "owner_exists"
  | "server_error";

export type CreateOwnerResult =
  | { ok: true; userId: string }
  | { ok: false; code: CreateOwnerErrorCode; message: string; fieldErrors?: Record<string, string> };

/** Arbitrary constant shared by every owner-creation attempt; serializes concurrent attempts across instances. */
const OWNER_CREATE_LOCK_ID = 7_310_552_115;

function mapHookError(error: unknown): CreateOwnerResult | null {
  if (!isAPIError(error)) return null;
  const code = (error.body as { code?: string } | undefined)?.code;
  switch (code) {
    case OWNER_ONLY_ERROR.OWNER_EXISTS.code:
      return { ok: false, code: "owner_exists", message: "An owner account already exists." };
    case OWNER_ONLY_ERROR.EMAIL_NOT_ALLOWED.code:
      return { ok: false, code: "email_not_allowed", message: "That email is not the configured owner email." };
    case OWNER_ONLY_ERROR.OWNER_EMAIL_NOT_CONFIGURED.code:
      return { ok: false, code: "owner_email_not_configured", message: "OWNER_EMAIL is not configured." };
    default:
      return null;
  }
}

export async function createOwnerAccount(input: OwnerAccountInput): Promise<CreateOwnerResult> {
  const parsed = ownerAccountSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      code: "invalid_input",
      message: "Check the highlighted fields.",
      fieldErrors: fieldErrorsFrom(parsed.error),
    };
  }
  const { email, name, password } = parsed.data;

  const ownerEmail = getOwnerEmail();
  if (!ownerEmail) {
    return { ok: false, code: "owner_email_not_configured", message: "OWNER_EMAIL is not configured." };
  }
  if (email !== ownerEmail) {
    return {
      ok: false,
      code: "email_not_allowed",
      message: "That email is not the configured owner email.",
      fieldErrors: { email: "Use the owner email configured for this deployment." },
    };
  }

  const lockClient = await getPool().connect();
  try {
    await lockClient.query("SELECT pg_advisory_lock($1)", [OWNER_CREATE_LOCK_ID]);
    try {
      if (await ownerExists()) {
        return { ok: false, code: "owner_exists", message: "An owner account already exists." };
      }
      const ctx = await getAuth().$context;
      const passwordHash = await ctx.password.hash(password);
      const created = await ctx.internalAdapter.createUser(
        { email, name, emailVerified: true },
        { method: "email-password" },
      );
      if (!created) {
        return { ok: false, code: "server_error", message: "The owner account could not be created." };
      }
      try {
        await ctx.internalAdapter.linkAccount({
          userId: created.id,
          providerId: "credential",
          accountId: created.id,
          password: passwordHash,
        });
      } catch (linkError) {
        // Never leave a password-less owner behind: it would block /setup and the CLI forever.
        await ctx.internalAdapter.deleteUser(created.id);
        throw linkError;
      }
      logEvent("info", "auth.owner_created", { userId: created.id });
      return { ok: true, userId: created.id };
    } finally {
      await lockClient.query("SELECT pg_advisory_unlock($1)", [OWNER_CREATE_LOCK_ID]);
    }
  } catch (error) {
    const mapped = mapHookError(error);
    if (mapped) return mapped;
    logEvent("error", "auth.owner_create_failed", { error: error instanceof Error ? error.name : "unknown" });
    return { ok: false, code: "server_error", message: "The owner account could not be created." };
  } finally {
    lockClient.release();
  }
}
