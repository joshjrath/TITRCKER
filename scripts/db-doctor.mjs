#!/usr/bin/env node
// Read-only database health report for Tenth. Prints no financial data.
// Usage: npm run db:doctor            (uses DATABASE_URL, or .env.local when unset)
//        node scripts/db-doctor.mjs --url <postgres-url>
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OWNER_TABLES = [
  "app_settings",
  "income_entry",
  "income_adjustment",
  "opening_obligation",
  "church_payment",
  "payment_allocation",
  "set_aside_entry",
  "audit_event",
  "idempotency_record",
];

const argIndex = process.argv.indexOf("--url");
const override = argIndex !== -1 ? process.argv[argIndex + 1] : undefined;
if (!override && !process.env.DATABASE_URL && existsSync(join(root, ".env.local"))) {
  process.loadEnvFile(join(root, ".env.local"));
}
const connectionString = override ?? process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set (or pass --url).");
  process.exit(1);
}

let problems = 0;
const ok = (msg) => console.log(`  ok    ${msg}`);
const bad = (msg) => {
  problems += 1;
  console.log(`  FAIL  ${msg}`);
};

const client = new pg.Client({ connectionString, application_name: "tenth-db-doctor" });
try {
  await client.connect();
  console.log("Tenth database doctor\n");

  const { rows: [role] } = await client.query(
    "SELECT current_user AS name, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user",
  );
  if (role.rolsuper || role.rolbypassrls) {
    bad(`role "${role.name}" is ${role.rolsuper ? "SUPERUSER" : "BYPASSRLS"}: row-level security is bypassed`);
  } else {
    ok(`role "${role.name}" is subject to row-level security`);
  }

  const { rows: tables } = await client.query(
    `SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity,
            (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policies
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = ANY($1)`,
    [OWNER_TABLES],
  );
  const byName = new Map(tables.map((t) => [t.relname, t]));
  for (const name of OWNER_TABLES) {
    const t = byName.get(name);
    if (!t) bad(`table ${name} is missing (run npm run db:migrate)`);
    else if (!t.relrowsecurity || !t.relforcerowsecurity || Number(t.policies) === 0) {
      bad(`table ${name}: RLS enabled=${t.relrowsecurity} forced=${t.relforcerowsecurity} policies=${t.policies}`);
    }
  }
  if (tables.length === OWNER_TABLES.length) ok(`RLS enabled, forced and has policies on all ${OWNER_TABLES.length} owner tables`);

  const migrations = await client
    .query("SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations")
    .then((r) => r.rows[0].n)
    .catch(() => 0);
  if (migrations > 0) ok(`${migrations} migrations applied`);
  else bad("no migrations recorded (run npm run db:migrate)");

  const { rows: [ssl] } = await client.query("SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()");
  console.log(`  info  connection TLS: ${ssl?.ssl ? "yes" : "no (expected on a private network such as Render's internal URL)"}`);

  const { rows: [users] } = await client.query('SELECT count(*)::int AS n FROM "user"');
  console.log(`  info  accounts: ${users.n} (Tenth allows exactly one owner)`);
} catch (err) {
  bad(`could not inspect the database: ${err instanceof Error ? err.message.split("\n")[0] : "unknown error"}`);
} finally {
  await client.end().catch(() => {});
}

console.log(problems === 0 ? "\nAll checks passed." : `\n${problems} problem(s) found.`);
process.exit(problems === 0 ? 0 : 1);
