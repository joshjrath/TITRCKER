/**
 * Authentication policy constants shared by the Better Auth config, the server actions and the auth forms.
 * Plain values only (no server imports), so client components may import this module too.
 */

/** Password length rules (also enforced by Better Auth's emailAndPassword options). */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

/** Display-name length for the owner account. */
export const OWNER_NAME_MAX_LENGTH = 80;

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 60 * SECONDS_PER_MINUTE;
const SECONDS_PER_DAY = 24 * SECONDS_PER_HOUR;

/** Session lifetime: 7 days, extended at most once per day while in use. */
export const SESSION_EXPIRES_IN_SECONDS = 7 * SECONDS_PER_DAY;
export const SESSION_UPDATE_AGE_SECONDS = SECONDS_PER_DAY;
/** Sessions younger than this count as "fresh" for Better Auth endpoints that require it. */
export const SESSION_FRESH_AGE_SECONDS = SECONDS_PER_HOUR;

/** "Trust this device" for two-factor sign-in lasts 30 days. */
export const TRUST_DEVICE_DAYS = 30;
export const TRUST_DEVICE_MAX_AGE_SECONDS = TRUST_DEVICE_DAYS * SECONDS_PER_DAY;

/** Two-factor backup codes: how many are issued at once and how many characters each has. */
export const BACKUP_CODE_COUNT = 10;
export const BACKUP_CODE_LENGTH = 10;

/** A Better Auth rate-limit rule: at most `max` requests per `window` seconds. */
export interface AuthRateRule {
  window: number;
  max: number;
}

/** Better Auth's database-backed limiter, keyed on the client IP. */
export const AUTH_RATE_LIMITS = {
  /** Every auth endpoint without a specific rule. */
  default: { window: SECONDS_PER_MINUTE, max: 60 },
  /** Credential checks: 5 per minute per client IP. */
  signIn: { window: SECONDS_PER_MINUTE, max: 5 },
  /** Second factor during sign-in: 5 per 5 minutes per IP (the plugin also locks the account after 10 misses). */
  secondFactor: { window: 5 * SECONDS_PER_MINUTE, max: 5 },
  /** Other two-factor endpoints (enable, disable, backup codes). */
  twoFactor: { window: SECONDS_PER_MINUTE, max: 10 },
  changePassword: { window: 5 * SECONDS_PER_MINUTE, max: 5 },
  /** Session reads are cheap and frequent. */
  getSession: { window: SECONDS_PER_MINUTE, max: 120 },
} as const satisfies Record<string, AuthRateRule>;

/**
 * Deployment-wide brakes on credential checks, independent of the client IP (src/server/security/auth-brake.ts):
 * 30 per 15 minutes each for password checks and for second-factor checks.
 */
export const GLOBAL_CREDENTIAL_LIMIT = { max: 30, windowSeconds: 15 * SECONDS_PER_MINUTE } as const;
export const GLOBAL_SECOND_FACTOR_LIMIT = { max: 30, windowSeconds: 15 * SECONDS_PER_MINUTE } as const;

/** Cookie name prefix (cookies are `tenth.session_token`, or `__Secure-tenth.session_token` over HTTPS). */
export const AUTH_COOKIE_PREFIX = "tenth";

/** TOTP issuer label shown in authenticator apps. */
export const TOTP_ISSUER = "Tenth";

/** Routes that are reachable without a session. */
export const PUBLIC_AUTH_PATHS = ["/sign-in", "/sign-in/two-factor", "/setup"] as const;
