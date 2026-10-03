/**
 * Drizzle schema entry point (drizzle.config.ts points here; the db client is typed with it).
 * Migrations are generated from this file into ./drizzle with `npm run db:generate`.
 */
import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export * from "./auth-schema";

// ---------------------------------------------------------------------------------------------
// Infrastructure tables (not owner data; no RLS)
// ---------------------------------------------------------------------------------------------

/** Fixed-window rate limiter for app mutations/exports (see src/server/security/rate-limit.ts). */
export const appRateLimit = pgTable("app_rate_limit", {
  key: text("key").primaryKey(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  count: integer("count").notNull(),
});

// ---------------------------------------------------------------------------------------------
// APPLICATION TABLES (owner data, RLS forced) — added by the data workstream below this line.
// See docs/ARCHITECTURE.md §5.
// ---------------------------------------------------------------------------------------------
