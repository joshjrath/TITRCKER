import { connection } from "next/server";
import { sql } from "drizzle-orm";

import { getDb } from "@/server/db/client";
import { logEvent } from "@/server/log";

const HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
} as const;

/** GET /api/health — liveness + database reachability for Render. Returns no data. */
export async function GET(): Promise<Response> {
  await connection(); // never prerender at build time (no database there)
  try {
    await getDb().execute(sql`SELECT 1`);
    return new Response(JSON.stringify({ status: "ok" }), { status: 200, headers: HEADERS });
  } catch (err) {
    logEvent("error", "health.db_unreachable", { error: err instanceof Error ? err.name : typeof err });
    return new Response(JSON.stringify({ status: "error" }), { status: 503, headers: HEADERS });
  }
}
