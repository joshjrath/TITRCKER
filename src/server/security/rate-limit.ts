import "server-only";

import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";

import { getDb } from "@/server/db/client";

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
  /** Deployment-wide ceiling on /setup attempts (independent of the spoofable client IP). */
  setupGlobal: { max: 30, windowSeconds: 900 },
  /** Password-confirmed security actions (2FA enrollment/disable, backup codes, password change). */
  security: { max: 10, windowSeconds: 900 },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

const MAX_KEY_LENGTH = 200;
const MAX_WINDOW_SECONDS = 7 * 24 * 60 * 60;

/**
 * The value stored in `app_rate_limit.key`: the scope prefix (text before the first ':') kept readable for
 * operations, the full key hashed so identifiers such as IP addresses or owner ids are never stored verbatim.
 */
export function rateLimitStorageKey(key: string): string {
  const colon = key.indexOf(":");
  const scope = colon > 0 ? key.slice(0, colon) : "key";
  const digest = createHash("sha256").update(key, "utf8").digest("base64url").slice(0, 32);
  return `${scope}:${digest}`;
}

function assertValid(key: string, rule: RateLimitRule): void {
  if (key.length === 0 || key.length > MAX_KEY_LENGTH) throw new Error("Rate limit key must be 1-200 characters");
  if (!Number.isSafeInteger(rule.max) || rule.max < 1) throw new Error("Rate limit max must be a positive integer");
  if (!Number.isSafeInteger(rule.windowSeconds) || rule.windowSeconds < 1 || rule.windowSeconds > MAX_WINDOW_SECONDS) {
    throw new Error("Rate limit window must be 1 second to 7 days");
  }
}

/**
 * Fixed-window limiter backed by the `app_rate_limit` table so it works across instances.
 * One atomic upsert per call: a new key or an expired window starts at count 1, otherwise the count increments.
 * Time comes from the database clock, so every instance agrees on window boundaries.
 * `key` must not contain sensitive data (use e.g. `mutation:<ownerId>`); it is hashed before storage anyway.
 */
export async function checkRateLimit(key: string, rule: RateLimitRule): Promise<RateLimitResult> {
  assertValid(key, rule);
  const storageKey = rateLimitStorageKey(key);
  const result = await getDb().execute<{ count: number; retry_after: number }>(sql`
    INSERT INTO app_rate_limit AS r (key, window_start, count)
    VALUES (${storageKey}, now(), 1)
    ON CONFLICT (key) DO UPDATE SET
      window_start = CASE
        WHEN r.window_start <= now() - make_interval(secs => ${rule.windowSeconds}) THEN now()
        ELSE r.window_start
      END,
      count = CASE
        WHEN r.window_start <= now() - make_interval(secs => ${rule.windowSeconds}) THEN 1
        ELSE LEAST(r.count + 1, 2147483647)
      END
    RETURNING
      r.count AS count,
      GREATEST(1, CEIL(EXTRACT(EPOCH FROM (r.window_start + make_interval(secs => ${rule.windowSeconds}) - now()))))::int
        AS retry_after
  `);
  const row = result.rows[0];
  if (!row) throw new Error("Rate limit upsert returned no row");
  if (Number(row.count) <= rule.max) return { ok: true };
  return { ok: false, retryAfterSeconds: Number(row.retry_after) };
}

/** Deletes windows older than `olderThanSeconds` (housekeeping; safe to call any time). */
export async function pruneRateLimits(olderThanSeconds = 24 * 60 * 60): Promise<number> {
  const result = await getDb().execute(
    sql`DELETE FROM app_rate_limit WHERE window_start < now() - make_interval(secs => ${olderThanSeconds})`,
  );
  return result.rowCount ?? 0;
}
