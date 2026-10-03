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

/** Connection pool settings. A single-owner app needs few connections; timeouts keep a stuck query from piling up. */
const POOL_MAX_CONNECTIONS = 10;
/** A query running longer than this is cancelled by the server (surfaces as a "busy, try again" conflict). */
const STATEMENT_TIMEOUT_MS = 15_000;
/** A transaction left idle this long (e.g. a crashed request) is terminated so it releases its locks. */
const IDLE_IN_TRANSACTION_TIMEOUT_MS = 30_000;
/** Give up acquiring a new connection after this long. */
const CONNECTION_TIMEOUT_MS = 10_000;
/** Close pooled connections that have been idle this long. */
const IDLE_CONNECTION_TIMEOUT_MS = 30_000;

const globalForDb = globalThis as typeof globalThis & { __tenthDb?: DbState };

let state: DbState | undefined = globalForDb.__tenthDb;

function createState(): DbState {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  const pool = new Pool({
    connectionString,
    max: POOL_MAX_CONNECTIONS,
    application_name: "tenth",
    statement_timeout: STATEMENT_TIMEOUT_MS,
    idle_in_transaction_session_timeout: IDLE_IN_TRANSACTION_TIMEOUT_MS,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
    idleTimeoutMillis: IDLE_CONNECTION_TIMEOUT_MS,
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
