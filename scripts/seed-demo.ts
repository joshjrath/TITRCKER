/**
 * Seeds an ISOLATED demo database with clearly fictional sample data for visual review.
 *
 *   DEMO_DATABASE_URL=postgres://tenth_app:...@127.0.0.1:5432/tenth_demo npm run demo:seed [-- --reset]
 *
 * Safety rails (it can never write invented income into a real account):
 * - Requires DEMO_DATABASE_URL, whose database name must contain "demo" and must differ from DATABASE_URL.
 * - Creates its own owner (demo@tenth.local) in that database only.
 * - Run the app against it with DATABASE_URL=<demo url> OWNER_EMAIL=demo@tenth.local TENTH_DEMO_MODE=1, which shows a
 *   permanent "Demo data" banner.
 */
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";

import pg from "pg";

const root = join(import.meta.dirname, "..");
const envFile = join(root, ".env.local");
if (existsSync(envFile)) process.loadEnvFile(envFile);

const DEMO_EMAIL = "demo@tenth.local";
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "demo-passphrase-2026";

function fail(message: string): never {
  console.error(`[demo] ${message}`);
  process.exit(1);
}

const demoUrl = process.env.DEMO_DATABASE_URL;
if (!demoUrl) fail("Set DEMO_DATABASE_URL to a separate database whose name contains 'demo'.");
const databaseName = new URL(demoUrl).pathname.replace(/^\//, "");
if (!databaseName.toLowerCase().includes("demo")) fail(`Refusing: database "${databaseName}" does not contain "demo".`);
if (process.env.DATABASE_URL && process.env.DATABASE_URL === demoUrl) fail("Refusing: DEMO_DATABASE_URL equals DATABASE_URL.");

// Point every app module at the demo database and demo owner before they are imported.
process.env.DATABASE_URL = demoUrl;
process.env.OWNER_EMAIL = DEMO_EMAIL;

async function resetSchema(): Promise<void> {
  const client = new pg.Client({ connectionString: demoUrl });
  await client.connect();
  try {
    await client.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
    await client.query("DROP SCHEMA IF EXISTS public CASCADE");
    await client.query("CREATE SCHEMA public");
  } finally {
    await client.end();
  }
}

async function main(): Promise<void> {
  if (process.argv.includes("--reset")) await resetSchema();
  const migrated = spawnSync("node", ["scripts/migrate.mjs", "--url", demoUrl!], { cwd: root, stdio: "inherit" });
  if (migrated.status !== 0) fail("Migration failed.");

  const { createOwnerAccount, ownerExists } = await import("@/server/auth/owner");
  if (await ownerExists()) {
    console.log("[demo] Demo owner already exists; nothing to do (use --reset to start over).");
    return;
  }
  const owner = await createOwnerAccount({ email: DEMO_EMAIL, name: "Demo", password: DEMO_PASSWORD });
  if (!owner.ok) fail(`Could not create the demo owner: ${owner.message}`);

  const { getDb, closeDb } = await import("@/server/db/client");
  const { user } = await import("@/server/db/schema");
  const { eq } = await import("drizzle-orm");
  const [row] = await getDb().select({ id: user.id }).from(user).where(eq(user.email, DEMO_EMAIL));
  if (!row) fail("Demo owner row not found after creation.");

  const { getSettings } = await import("@/server/services/settings");
  const { updateSettings } = await import("@/server/services/settings-update");
  const { createIncome, createAdjustment } = await import("@/server/services/income");
  const { createOpening } = await import("@/server/services/opening");
  const { recordPayment } = await import("@/server/services/payments");
  const { createSetAside } = await import("@/server/services/set-aside");

  const ctx = { ownerId: row.id, now: new Date() };
  const key = () => randomUUID();

  const settings = await getSettings(ctx);
  await updateSettings(ctx, {
    idempotencyKey: key(),
    expectedVersion: settings.version,
    trackingStart: "2026-01-01",
    timeZone: "America/Toronto",
    displayCurrency: "CAD",
    churchName: "Sample Community Church",
    nextPayoutDate: "2026-12-31",
  });

  await createOpening(ctx, {
    idempotencyKey: key(),
    amount: "120.00",
    currency: "CAD",
    effectiveOn: "2025-12-31",
    label: "Opening balance",
    note: "Sample: tithe owed from 2025",
  });

  const months = ["01", "02", "03", "04", "05", "06", "07", "08", "09"];
  for (const month of months) {
    await createIncome(ctx, {
      idempotencyKey: key(),
      amount: "3,250.00",
      currency: "CAD",
      receivedOn: `2026-${month}-15`,
      source: "Sample employer",
      category: "Salary",
    });
  }
  const freelance = await createIncome(ctx, {
    idempotencyKey: key(),
    amount: "480.00",
    currency: "CAD",
    receivedOn: "2026-04-22",
    source: "Sample design client",
    category: "Freelance",
    note: "Sample invoice, part refunded later",
  });
  await createIncome(ctx, { idempotencyKey: key(), amount: "249.99", currency: "CAD", receivedOn: "2026-07-03", source: "Sample marketplace", category: "Freelance" });
  await createIncome(ctx, { idempotencyKey: key(), amount: "75.00", currency: "CAD", receivedOn: "2026-08-09", source: "Sample birthday gift", category: "Gift" });
  await createIncome(ctx, { idempotencyKey: key(), amount: "0.05", currency: "CAD", receivedOn: "2026-09-01", source: "Sample interest", category: "Interest" });
  await createIncome(ctx, { idempotencyKey: key(), amount: "600.00", currency: "USD", receivedOn: "2026-06-12", source: "Sample US contract", category: "Freelance" });

  await createAdjustment(ctx, {
    idempotencyKey: key(),
    incomeId: freelance.id,
    kind: "refund",
    amount: "80.00",
    effectiveOn: "2026-05-02",
    reason: "Sample partial refund to client",
  });

  await recordPayment(ctx, {
    idempotencyKey: key(),
    amount: "1,500.00",
    currency: "CAD",
    paidOn: "2026-06-30",
    churchName: "Sample Community Church",
    reference: "Sample e-transfer",
    allocations: "auto",
    confirmCredit: false,
    confirmMadePayment: true,
    drawFromSetAside: false,
  });

  await createSetAside(ctx, { idempotencyKey: key(), kind: "reserve", amount: "600.00", currency: "CAD", effectiveOn: "2026-09-30", note: "Sample reserve" });

  await closeDb();
  console.log(`[demo] Seeded "${databaseName}". Sign in as ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  console.log("[demo] Start the app with DATABASE_URL=<demo url> OWNER_EMAIL=demo@tenth.local TENTH_DEMO_MODE=1");
}

main().catch((err: unknown) => {
  console.error("[demo] Seeding failed:", err instanceof Error ? err.name : "unknown error");
  process.exit(1);
});
