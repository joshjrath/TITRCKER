#!/usr/bin/env node
// Starts a production build of Tenth for Playwright against the (wiped) test database.
// - Never touches the dev database: refuses to run if DATABASE_URL_TEST equals DATABASE_URL.
// - Uses the standard .next build output: stop any `next dev` in this checkout first.
// - Pins the clock with TENTH_TEST_MODE=1 + TENTH_TEST_NOW so dates in assertions are deterministic
//   (TENTH_ALLOW_TEST_MODE_IN_PRODUCTION=1 lets the production build start in test mode).
// Set E2E_SKIP_BUILD=1 to reuse an existing production build.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envFile = join(root, ".env.local");
if (existsSync(envFile)) process.loadEnvFile(envFile);

const testUrl = process.env.DATABASE_URL_TEST;
if (!testUrl) throw new Error("DATABASE_URL_TEST is not set");
if (process.env.DATABASE_URL && testUrl === process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL_TEST must point at a separate database (it is wiped)");
}

export const E2E_PORT = Number(process.env.E2E_PORT ?? 3100);
const env = {
  ...process.env,
  NODE_ENV: "production",
  NEXT_TELEMETRY_DISABLED: "1",
  DATABASE_URL: testUrl,
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? "e2e-only-secret-please-change-0123456789abcdef",
  BETTER_AUTH_URL: `http://localhost:${E2E_PORT}`,
  OWNER_EMAIL: "owner@e2e.test",
  OWNER_SETUP_TOKEN: "e2e-setup-token-0123456789",
  TENTH_TEST_MODE: "1",
  // Test mode in a production build is a fatal startup error unless explicitly allowed (E2E only).
  TENTH_ALLOW_TEST_MODE_IN_PRODUCTION: "1",
  TENTH_TEST_NOW: process.env.TENTH_TEST_NOW ?? "2026-10-03T16:00:00.000Z", // noon in Toronto
  // Pinned USD→CAD rate so the combined total is deterministic and no test touches the network.
  TENTH_FX_TEST_RATE: "1.3500",
};

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: root, env, stdio: "inherit" });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(" ")} exited ${code}`))));
  });
}

async function resetDatabase() {
  const client = new pg.Client({ connectionString: testUrl, application_name: "tenth-e2e-reset" });
  await client.connect();
  try {
    await client.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
    await client.query("DROP SCHEMA IF EXISTS public CASCADE");
    await client.query("CREATE SCHEMA public");
  } finally {
    await client.end();
  }
}

await resetDatabase();
await run("node", ["scripts/migrate.mjs", "--url", testUrl]);
if (process.env.E2E_SKIP_BUILD !== "1" || !existsSync(join(root, ".next", "BUILD_ID"))) {
  await run("npx", ["next", "build"]);
}
const server = spawn("npx", ["next", "start", "-p", String(E2E_PORT)], { cwd: root, env, stdio: "inherit" });
const stop = () => server.kill("SIGTERM");
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
server.on("exit", (code) => process.exit(code ?? 0));
