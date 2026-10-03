#!/usr/bin/env node
// Applies committed SQL migrations from ./drizzle. Plain Node ESM: runs on Render with production deps only.
// Usage: node scripts/migrate.mjs [--url <postgres-url>]
// Safe to run on every start: an advisory lock serializes concurrent runs, applied migrations are skipped.
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const LOCK_ID = 7_310_552_114; // arbitrary constant shared by every migrate run of this app

function parseUrlArg(argv) {
  const i = argv.indexOf("--url");
  if (i !== -1) {
    const value = argv[i + 1];
    if (!value) throw new Error("--url requires a value");
    return value;
  }
  const eq = argv.find((a) => a.startsWith("--url="));
  return eq ? eq.slice("--url=".length) : undefined;
}

async function main() {
  const override = parseUrlArg(process.argv.slice(2));
  const envFile = join(root, ".env.local");
  if (!override && !process.env.DATABASE_URL && existsSync(envFile)) {
    process.loadEnvFile(envFile);
  }
  const connectionString = override ?? process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set (or pass --url)");

  const client = new pg.Client({ connectionString, application_name: "tenth-migrate" });
  await client.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [LOCK_ID]);
    try {
      const started = Date.now();
      await migrate(drizzle(client), { migrationsFolder: join(root, "drizzle") });
      console.log(`[migrate] migrations up to date (${Date.now() - started} ms)`);
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [LOCK_ID]);
    }

    const { rows } = await client.query(
      "SELECT current_user AS role, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user",
    );
    const role = rows[0];
    if (role && (role.rolsuper || role.rolbypassrls)) {
      const bar = "!".repeat(78);
      console.warn(
        [
          bar,
          `WARNING: database role "${role.role}" is ${role.rolsuper ? "SUPERUSER" : "BYPASSRLS"}.`,
          "Row-level security is BYPASSED for this role, so the database-level owner",
          "isolation backstop is inactive. Connect the app with a role that has neither",
          "SUPERUSER nor BYPASSRLS (it may own the tables; RLS is FORCED on them).",
          bar,
        ].join("\n"),
      );
    } else {
      console.log(`[migrate] role "${role?.role ?? "unknown"}" is subject to row-level security`);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  // Never print the connection string; error messages from pg do not include it.
  console.error("[migrate] FAILED:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
