import "server-only";

export interface RateLimitRule {
  /** Maximum number of hits allowed per window. */
  max: number;
  windowSeconds: number;
}

/** Named limits used across the app. */
export const RATE_LIMITS = {
  mutation: { max: 60, windowSeconds: 60 },
  export: { max: 10, windowSeconds: 300 },
  setup: { max: 5, windowSeconds: 900 },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

/**
 * Fixed-window limiter backed by the `app_rate_limit` table so it works across instances.
 * `key` must not contain sensitive data (use e.g. `mutation:<ownerId>`).
 */
export async function checkRateLimit(key: string, rule: RateLimitRule): Promise<RateLimitResult> {
  void key;
  void rule;
  throw new Error("checkRateLimit: not implemented yet (owned by the auth/security workstream)");
}
