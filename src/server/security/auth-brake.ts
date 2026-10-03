/**
 * Global (not per-IP) brakes for the credential-checking auth endpoints.
 *
 * Why: Better Auth's own limiter keys on the client IP, which comes from the first X-Forwarded-For hop. Render's
 * edge APPENDS to a client-supplied X-Forwarded-For instead of replacing it, so an attacker can rotate that hop and
 * get a fresh per-IP bucket on every request. A single-owner app can afford a deployment-wide ceiling on credential
 * checks that does not depend on any request header. The numbers are far above what the owner ever needs, but cap
 * an online guessing attack at a few thousand attempts per day (passwords are 12+ chars, TOTP has its own lockout).
 *
 * Trade-off (deliberate): an attacker can exhaust the global bucket and keep the owner from signing in afresh for up
 * to one window (15 minutes) at a time. Existing sessions (7 days, refreshed while used) are unaffected.
 *
 * Pure module (type-only import of the limiter) so the path matching is unit-testable; the route handler applies it.
 */

import { GLOBAL_CREDENTIAL_LIMIT, GLOBAL_SECOND_FACTOR_LIMIT } from "@/server/auth/policy";

import type { RateLimitRule } from "./rate-limit";

/** Better Auth is mounted here (src/app/api/auth/[...all]). */
export const AUTH_BASE_PATH = "/api/auth";

const CREDENTIAL_RULE: RateLimitRule = GLOBAL_CREDENTIAL_LIMIT;
const SECOND_FACTOR_RULE: RateLimitRule = GLOBAL_SECOND_FACTOR_LIMIT;

/** Endpoint (relative to AUTH_BASE_PATH, lower-case) -> global limit. */
export const GLOBAL_AUTH_LIMITS: Readonly<Record<string, RateLimitRule>> = {
  "/sign-in/email": CREDENTIAL_RULE,
  "/change-password": CREDENTIAL_RULE,
  "/two-factor/verify-totp": SECOND_FACTOR_RULE,
  "/two-factor/verify-backup-code": SECOND_FACTOR_RULE,
  "/two-factor/verify-otp": SECOND_FACTOR_RULE,
};

export interface GlobalAuthLimit {
  /** Rate-limit key (no client data in it). */
  key: string;
  rule: RateLimitRule;
}

/**
 * The global limit that applies to a request to `pathname`, or null. Matching is deliberately loose (case, repeated
 * and trailing slashes) so path spelling variants the auth router might accept cannot dodge the brake.
 */
export function globalAuthLimitFor(method: string, pathname: string): GlobalAuthLimit | null {
  if (method.toUpperCase() !== "POST") return null;
  let path = pathname.toLowerCase().replace(/\/{2,}/g, "/");
  if (!path.startsWith(AUTH_BASE_PATH + "/")) return null;
  path = path.slice(AUTH_BASE_PATH.length).replace(/\/+$/, "");
  const rule = GLOBAL_AUTH_LIMITS[path];
  return rule ? { key: `auth-global:${path}`, rule } : null;
}
