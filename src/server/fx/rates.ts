import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";

import { DEFAULT_TIME_ZONE, daysBetween, parseFxRate, todayInZone, toLocalDate, type FxRate, type LocalDate } from "@/domain";
import { getDb } from "@/server/db/client";
import { exchangeRate } from "@/server/db/schema";
import { logEvent } from "@/server/log";

import { fetchProviderRate, FX_PROVIDERS, type FxProvider, type ProviderRate } from "./providers";

/** A cached rate younger than this is reused without asking the providers again. */
export const FX_REFRESH_AFTER_MS = 6 * 60 * 60 * 1000;
/** Rates are published on business days; older than this (weekends + a holiday) means the providers were unreachable. */
export const FX_STALE_AFTER_DAYS = 4;

export interface RateDeps {
  fetchImpl?: typeof fetch;
  providers?: readonly FxProvider[];
}

interface CachedRow {
  rate: string;
  observedOn: string;
  source: string;
  fetchedAt: Date;
}

function isStale(observedOn: LocalDate, now: Date): boolean {
  return daysBetween(observedOn, todayInZone(now, DEFAULT_TIME_ZONE)) > FX_STALE_AFTER_DAYS;
}

function toFxRate(row: CachedRow, now: Date): FxRate {
  const observedOn = toLocalDate(row.observedOn);
  return {
    base: "USD",
    quote: "CAD",
    rate: row.rate,
    observedOn,
    source: row.source === "ecb_frankfurter" ? "ecb_frankfurter" : "bank_of_canada",
    fetchedAt: row.fetchedAt.toISOString(),
    stale: isStale(observedOn, now),
  };
}

/** Test-only fixed rate (TENTH_TEST_MODE=1 + TENTH_FX_TEST_RATE), so E2E runs never depend on the network. */
function testFixtureRate(now: Date): FxRate | null {
  const fixture = process.env.TENTH_FX_TEST_RATE?.trim();
  if (process.env.TENTH_TEST_MODE !== "1" || !fixture || !parseFxRate(fixture)) return null;
  return {
    base: "USD",
    quote: "CAD",
    rate: fixture,
    observedOn: todayInZone(now, DEFAULT_TIME_ZONE),
    source: "test_fixture",
    fetchedAt: now.toISOString(),
    stale: false,
  };
}

async function latestCached(): Promise<CachedRow | null> {
  const [row] = await getDb()
    .select({ rate: exchangeRate.rate, observedOn: exchangeRate.observedOn, source: exchangeRate.source, fetchedAt: exchangeRate.fetchedAt })
    .from(exchangeRate)
    .where(and(eq(exchangeRate.base, "USD"), eq(exchangeRate.quote, "CAD")))
    .orderBy(desc(exchangeRate.observedOn), desc(exchangeRate.fetchedAt))
    .limit(1);
  return row ?? null;
}

async function store(rate: ProviderRate, now: Date): Promise<void> {
  await getDb()
    .insert(exchangeRate)
    .values({ base: "USD", quote: "CAD", rate: rate.rate, observedOn: rate.observedOn, source: rate.source, fetchedAt: now })
    .onConflictDoUpdate({
      target: [exchangeRate.base, exchangeRate.quote, exchangeRate.observedOn, exchangeRate.source],
      set: { rate: sql`excluded.rate`, fetchedAt: sql`excluded.fetched_at` },
    });
}

async function refresh(now: Date, deps: RateDeps): Promise<FxRate | null> {
  const cached = await latestCached();
  if (cached && now.getTime() - cached.fetchedAt.getTime() < FX_REFRESH_AFTER_MS) return toFxRate(cached, now);

  for (const provider of deps.providers ?? FX_PROVIDERS) {
    const fetched = await fetchProviderRate(provider, deps.fetchImpl);
    if (!fetched) {
      logEvent("warn", "fx.provider_failed", { source: provider.source });
      continue;
    }
    try {
      await store(fetched, now);
    } catch (err) {
      logEvent("warn", "fx.store_failed", { source: provider.source, error: err instanceof Error ? err.name : "unknown" });
    }
    return toFxRate({ ...fetched, fetchedAt: now }, now);
  }
  logEvent("warn", "fx.refresh_failed", { cached: cached !== null });
  return cached ? toFxRate(cached, now) : null;
}

let inflight: Promise<FxRate | null> | null = null;

/**
 * The current USD→CAD rate for the combined total: the cached rate while it is fresh, otherwise a new one from the
 * Bank of Canada (falling back to the ECB), otherwise the last cached rate flagged `stale`, otherwise null.
 * Concurrent callers in one process share a single refresh.
 */
export async function getUsdCadRate(now: Date, deps: RateDeps = {}): Promise<FxRate | null> {
  const fixture = testFixtureRate(now);
  if (fixture) return fixture;
  if (!inflight) {
    inflight = refresh(now, deps).finally(() => {
      inflight = null;
    });
  }
  try {
    return await inflight;
  } catch (err) {
    logEvent("warn", "fx.unavailable", { error: err instanceof Error ? err.name : "unknown" });
    return null;
  }
}
