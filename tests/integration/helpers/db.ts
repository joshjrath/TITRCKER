import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";

import { getDb } from "@/server/db/client";
import { user } from "@/server/db/schema";

/** Inserts a Better Auth user row directly (no password/account) and returns its id. */
export async function createTestUser(email?: string): Promise<string> {
  const id = randomUUID();
  await getDb()
    .insert(user)
    .values({ id, name: "Test Owner", email: email ?? `owner-${id}@example.test`, emailVerified: true });
  return id;
}

/**
 * Empties every table in the public schema (app + auth) between test files. The app role owns the tables,
 * so TRUNCATE works and is not affected by row-level security. Migration bookkeeping lives in the
 * separate "drizzle" schema and is untouched.
 */
export async function resetAppData(): Promise<void> {
  const db = getDb();
  const result = await db.execute<{ tablename: string }>(
    sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
  );
  const names = result.rows.map((r) => `"public"."${r.tablename.replaceAll('"', '""')}"`);
  if (names.length === 0) return;
  await db.execute(sql.raw(`TRUNCATE TABLE ${names.join(", ")} RESTART IDENTITY CASCADE`));
}
