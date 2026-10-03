import "server-only";

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { twoFactor } from "better-auth/plugins";

import { getDb } from "@/server/db/client";
import { account, rateLimit, session, twoFactor as twoFactorTable, user, verification } from "@/server/db/auth-schema";
import { CLIENT_IP_HEADER } from "@/server/security/client-ip";

import {
  getOwnerEmail,
  isLoopbackHttp,
  isProduction,
  resolveAuthSecret,
  resolveBaseUrl,
  resolveTrustedOrigins,
} from "./config";
import { ownerExists } from "./owner-exists";
import {
  AUTH_COOKIE_PREFIX,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  SESSION_EXPIRES_IN_SECONDS,
  SESSION_FRESH_AGE_SECONDS,
  SESSION_UPDATE_AGE_SECONDS,
  TOTP_ISSUER,
  TRUST_DEVICE_DAYS,
} from "./policy";

/** Error codes thrown by the owner-only database hook (surfaced by createOwnerAccount). */
export const OWNER_ONLY_ERROR = {
  OWNER_EXISTS: { code: "OWNER_EXISTS", message: "The owner account already exists" },
  EMAIL_NOT_ALLOWED: { code: "EMAIL_NOT_ALLOWED", message: "This email is not allowed to own this Tenth" },
  OWNER_EMAIL_NOT_CONFIGURED: { code: "OWNER_EMAIL_NOT_CONFIGURED", message: "OWNER_EMAIL is not configured" },
} as const;

/**
 * Owner-only invariant, enforced for every user creation path (Better Auth endpoints, internal adapter, CLI):
 * the email must equal OWNER_EMAIL (case-insensitive) and no user may exist yet.
 */
async function assertOwnerMayBeCreated(email: string): Promise<void> {
  const ownerEmail = getOwnerEmail();
  if (!ownerEmail) throw APIError.from("FORBIDDEN", OWNER_ONLY_ERROR.OWNER_EMAIL_NOT_CONFIGURED);
  if (email.trim().toLowerCase() !== ownerEmail) throw APIError.from("FORBIDDEN", OWNER_ONLY_ERROR.EMAIL_NOT_ALLOWED);
  if (await ownerExists()) throw APIError.from("FORBIDDEN", OWNER_ONLY_ERROR.OWNER_EXISTS);
}

function createAuth() {
  const baseURL = resolveBaseUrl();
  const secureCookies = isProduction() && !isLoopbackHttp(baseURL);

  return betterAuth({
    appName: "Tenth",
    baseURL,
    secret: resolveAuthSecret(),
    trustedOrigins: resolveTrustedOrigins(baseURL),
    telemetry: { enabled: false },
    database: drizzleAdapter(getDb(), {
      provider: "pg",
      schema: { user, session, account, verification, twoFactor: twoFactorTable, rateLimit },
    }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: PASSWORD_MAX_LENGTH,
      autoSignIn: false,
    },
    session: {
      expiresIn: SESSION_EXPIRES_IN_SECONDS,
      updateAge: SESSION_UPDATE_AGE_SECONDS,
      freshAge: SESSION_FRESH_AGE_SECONDS,
    },
    // Endpoints Tenth never uses (single owner, no email delivery, no social accounts).
    disabledPaths: [
      "/sign-up/email",
      "/request-password-reset",
      "/reset-password",
      "/change-email",
      "/delete-user",
      "/link-social",
      "/unlink-account",
      "/send-verification-email",
      "/verify-email",
    ],
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 60,
      customRules: {
        // Credential checks: 5 per minute per client IP.
        "/sign-in/email": { window: 60, max: 5 },
        // Second factor during sign-in: 5 per 5 minutes per IP (the plugin also locks the account after 10 misses).
        "/two-factor/verify-totp": { window: 300, max: 5 },
        "/two-factor/verify-backup-code": { window: 300, max: 5 },
        "/two-factor/*": { window: 60, max: 10 },
        "/change-password": { window: 300, max: 5 },
        // Session reads are cheap and frequent.
        "/get-session": { window: 60, max: 120 },
      },
    },
    advanced: {
      cookiePrefix: AUTH_COOKIE_PREFIX,
      // Explicit so origin/CSRF checks also run under NODE_ENV=test (Better Auth skips them there by default).
      disableOriginCheck: false,
      disableCSRFCheck: false,
      useSecureCookies: secureCookies,
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax", path: "/", secure: secureCookies },
      ipAddress: {
        // src/proxy.ts resolves the client IP (first X-Forwarded-For hop on Render) and overwrites this header.
        // A bare single-value X-Forwarded-For (local runs) is the fallback.
        ipAddressHeaders: [CLIENT_IP_HEADER, "x-forwarded-for"],
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (data) => {
            await assertOwnerMayBeCreated(data.email);
            return { data: { ...data, email: data.email.trim().toLowerCase(), name: data.name.trim() } };
          },
        },
      },
    },
    plugins: [
      twoFactor({
        issuer: TOTP_ISSUER,
        trustDeviceMaxAge: TRUST_DEVICE_DAYS * 24 * 60 * 60,
        backupCodeOptions: { amount: 10, length: 10, storeBackupCodes: "encrypted" },
      }),
      // Must stay last: copies Set-Cookie from auth.api calls in Server Actions onto the Next.js response.
      nextCookies(),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

const globalForAuth = globalThis as typeof globalThis & { __tenthAuth?: Auth };

/**
 * The Better Auth instance, created on first use so importing this module never reads secrets or connects to
 * the database (keeps `next build` working). Cached on globalThis to survive dev HMR.
 */
export function getAuth(): Auth {
  if (!globalForAuth.__tenthAuth) {
    globalForAuth.__tenthAuth = createAuth();
  }
  return globalForAuth.__tenthAuth;
}

/** Drops the cached instance (tests that change env between cases). */
export function resetAuthForTests(): void {
  delete globalForAuth.__tenthAuth;
}
