import "server-only";

/**
 * Environment-derived auth configuration. Every function reads process.env at call time (never at import time),
 * so `next build` works without runtime secrets.
 */

const DEV_BASE_URL = "http://localhost:3000";
export const MIN_SECRET_LENGTH = 32;

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/** True while `next build` runs (env vars for the runtime may legitimately be missing). */
export function isBuildPhase(): boolean {
  return process.env.NEXT_PHASE === "phase-production-build";
}

/**
 * Public origin of the app: BETTER_AUTH_URL, else Render's RENDER_EXTERNAL_URL, else localhost in development.
 * Production without either is a configuration error.
 */
export function resolveBaseUrl(): string {
  const raw = process.env.BETTER_AUTH_URL?.trim() || process.env.RENDER_EXTERNAL_URL?.trim();
  if (raw) {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new Error("BETTER_AUTH_URL / RENDER_EXTERNAL_URL is not a valid absolute URL");
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error("BETTER_AUTH_URL must use http or https");
    }
    return url.origin;
  }
  if (isProduction() && !isBuildPhase()) {
    throw new Error("BETTER_AUTH_URL (or Render's RENDER_EXTERNAL_URL) must be set in production");
  }
  return DEV_BASE_URL;
}

/** True for plain-http loopback origins (local `next start`), where Secure cookies would be dropped by browsers. */
export function isLoopbackHttp(origin: string): boolean {
  const url = new URL(origin);
  return url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
}

/**
 * Origins allowed to call the auth endpoints: the base URL plus an optional comma-separated
 * BETTER_AUTH_TRUSTED_ORIGINS (e.g. a custom domain next to the onrender.com one).
 */
export function resolveTrustedOrigins(baseUrl: string): string[] {
  const extra = (process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => new URL(s).origin);
  const renderUrl = process.env.RENDER_EXTERNAL_URL?.trim();
  const origins = new Set<string>([baseUrl, ...extra]);
  if (renderUrl) origins.add(new URL(renderUrl).origin);
  return [...origins];
}

/**
 * The Better Auth secret. In production it must exist and be at least 32 characters; failing here (at first use
 * and at server start via instrumentation) is deliberate. Outside production a missing secret falls back to a
 * fixed development value so local tooling works.
 */
export function resolveAuthSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET ?? "";
  if (secret.length >= MIN_SECRET_LENGTH) return secret;
  if (isProduction() && !isBuildPhase()) {
    throw new Error(`BETTER_AUTH_SECRET must be set to at least ${MIN_SECRET_LENGTH} characters in production`);
  }
  if (secret.length > 0) return secret;
  return "tenth-development-only-secret-do-not-use-in-production";
}

/** The single permitted owner email (lower-cased), or null when OWNER_EMAIL is not configured. */
export function getOwnerEmail(): string | null {
  const email = process.env.OWNER_EMAIL?.trim().toLowerCase();
  return email ? email : null;
}

/** Setup tokens shorter than this are ignored (the /setup page stays disabled). */
export const MIN_SETUP_TOKEN_LENGTH = 12;

/** The one-time setup token, or null when the /setup page is disabled (unset or too short to be safe). */
export function getOwnerSetupToken(): string | null {
  const token = process.env.OWNER_SETUP_TOKEN?.trim();
  return token && token.length >= MIN_SETUP_TOKEN_LENGTH ? token : null;
}
