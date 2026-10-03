import "server-only";

import { sql } from "drizzle-orm";

import { getDb } from "@/server/db/client";

/** True when any user row exists (Tenth is single-owner, so this means "the owner exists"). */
export async function ownerExists(): Promise<boolean> {
  const result = await getDb().execute<{ exists: boolean }>(sql`SELECT EXISTS (SELECT 1 FROM "user") AS "exists"`);
  return result.rows[0]?.exists === true;
}
