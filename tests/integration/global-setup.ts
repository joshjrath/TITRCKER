// Runs once before the integration suite: wipes the test database and rebuilds it from ./drizzle migrations,
// connecting as the app role (tenth_app) so tests exercise row-level security exactly as production does.
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

import { loadTestDatabaseUrl } from "./helpers/env";

const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));

export default async function setup(): Promise<void> {
  const connectionString = loadTestDatabaseUrl();
  const client = new pg.Client({ connectionString, application_name: "tenth-test-setup" });
  await client.connect();
  try {
    await client.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
    await client.query("DROP SCHEMA IF EXISTS public CASCADE");
    await client.query("CREATE SCHEMA public");
    await migrate(drizzle(client), { migrationsFolder });
  } finally {
    await client.end();
  }
}
