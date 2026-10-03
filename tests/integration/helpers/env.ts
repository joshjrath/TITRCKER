import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const envFile = fileURLToPath(new URL("../../../.env.local", import.meta.url));

/** Loads .env.local (without overriding variables already set) and returns the test database URL. */
export function loadTestDatabaseUrl(): string {
  if (existsSync(envFile)) {
    process.loadEnvFile(envFile);
  }
  const testUrl = process.env.DATABASE_URL_TEST;
  if (!testUrl) {
    throw new Error("DATABASE_URL_TEST is not set; integration tests need a dedicated (wipeable) database");
  }
  if (process.env.DATABASE_URL && process.env.DATABASE_URL === testUrl && process.env.TENTH_TEST_DB_ACTIVE !== "1") {
    throw new Error("DATABASE_URL_TEST must differ from DATABASE_URL (the test database is wiped)");
  }
  return testUrl;
}
