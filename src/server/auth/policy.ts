/**
 * Authentication policy constants shared by the Better Auth config, the server actions and the auth forms.
 * Plain values only (no server imports), so client components may import this module too.
 */

/** Password length rules (also enforced by Better Auth's emailAndPassword options). */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

/** Display-name length for the owner account. */
export const OWNER_NAME_MAX_LENGTH = 80;

/** Session lifetime: 7 days, extended at most once per day while in use. */
export const SESSION_EXPIRES_IN_SECONDS = 7 * 24 * 60 * 60;
export const SESSION_UPDATE_AGE_SECONDS = 24 * 60 * 60;
/** Sessions younger than this count as "fresh" for Better Auth endpoints that require it. */
export const SESSION_FRESH_AGE_SECONDS = 60 * 60;

/** "Trust this device" for two-factor sign-in lasts 30 days. */
export const TRUST_DEVICE_DAYS = 30;

/** Cookie name prefix (cookies are `tenth.session_token`, or `__Secure-tenth.session_token` over HTTPS). */
export const AUTH_COOKIE_PREFIX = "tenth";

/** TOTP issuer label shown in authenticator apps. */
export const TOTP_ISSUER = "Tenth";

/** Routes that are reachable without a session. */
export const PUBLIC_AUTH_PATHS = ["/sign-in", "/sign-in/two-factor", "/setup"] as const;
