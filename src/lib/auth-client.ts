"use client";

import { twoFactorClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const TWO_FACTOR_PATH = "/sign-in/two-factor";

/**
 * Browser-side Better Auth client. It talks to same-origin /api/auth (relative base URL), so it carries no
 * configuration or secrets. Only the sign-in flow uses it; everything else goes through Server Actions.
 */
export const authClient = createAuthClient({
  plugins: [
    // The sign-in form reads `twoFactorRedirect` from the response and routes to TWO_FACTOR_PATH with the
    // Next.js router (client-side navigation), so no onTwoFactorRedirect hook is registered here.
    twoFactorClient(),
  ],
});

/** Seconds from Better Auth's `X-Retry-After` header on a 429, if present. */
export function retryAfterFrom(response: Response | undefined): number | null {
  const raw = response?.headers.get("x-retry-after");
  const seconds = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}
