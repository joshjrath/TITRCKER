import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";

import { closeDb, getDb } from "@/server/db/client";
import { user } from "@/server/db/schema";
import { createTestUser, resetAppData } from "./helpers/db";

describe("integration harness", () => {
  beforeAll(resetAppData);
  afterAll(closeDb);

  it("connects to the migrated test database as a role subject to RLS", async () => {
    const db = getDb();
    expect(await db.select().from(user)).toHaveLength(0);

    const role = await db.execute<{ rolsuper: boolean; rolbypassrls: boolean; db: string }>(
      sql`SELECT rolsuper, rolbypassrls, current_database() AS db FROM pg_roles WHERE rolname = current_user`,
    );
    expect(role.rows[0]).toMatchObject({ rolsuper: false, rolbypassrls: false });
  });

  it("creates users and resets data", async () => {
    const id = await createTestUser();
    expect(await getDb().select({ id: user.id }).from(user)).toEqual([{ id }]);
    await resetAppData();
    expect(await getDb().select().from(user)).toHaveLength(0);
  });
});
