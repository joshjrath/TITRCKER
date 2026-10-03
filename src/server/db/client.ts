import "server-only";

import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

/**
 * Lazily-created connection pool + Drizzle instance.
 * Nothing touches DATABASE_URL until the first query, so `next build` works without a database.
 * In development the instance is cached on globalThis so HMR does not leak pools.
 */

export type Schema = typeof schema;
export type Database = NodePgDatabase<Schema>;

interface DbState {
  pool: Pool;
  db: Database;
}

const globalForDb = globalThis as typeof globalThis & { __tenthDb?: DbState };

let state: DbState | undefined = globalForDb.__tenthDb;

function createState(): DbState {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  const pool = new Pool({
    connectionString,
    max: 10,
    application_name: "tenth",
    statement_timeout: 15_000,
    idle_in_transaction_session_timeout: 30_000,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
  });
  // An idle client erroring (e.g. the server restarted) must not crash the process.
  pool.on("error", (err: Error & { code?: string }) => {
    console.error(JSON.stringify({ level: "error", event: "db.pool_error", code: err.code ?? null }));
  });
  return { pool, db: drizzle(pool, { schema }) };
}

function getState(): DbState {
  if (!state) {
    state = createState();
    if (process.env.NODE_ENV !== "production") {
      globalForDb.__tenthDb = state;
    }
  }
  return state;
}

export function getPool(): Pool {
  return getState().pool;
}

export function getDb(): Database {
  return getState().db;
}

/**
 * Lazy proxy over the Drizzle instance: importing `db` never connects; the pool is created on first use.
 * Prefer `getDb()` where a concrete instance is needed (e.g. passing to libraries that inspect it).
 */
export const db: Database = new Proxy({} as Database, {
  get(_target, prop) {
    const real = getDb();
    const value: unknown = Reflect.get(real, prop, real);
    return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(real) : value;
  },
  has(_target, prop) {
    return Reflect.has(getDb(), prop);
  },
});

/** Closes the pool (scripts and tests). Safe to call when nothing was opened. */
export async function closeDb(): Promise<void> {
  const current = state;
  state = undefined;
  if (globalForDb.__tenthDb === current) {
    delete globalForDb.__tenthDb;
  }
  if (current) {
    await current.pool.end();
  }
}
