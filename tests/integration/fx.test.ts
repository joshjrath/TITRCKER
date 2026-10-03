import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { toMinor, type CurrencyBalance, type Currency } from "@/domain";
import { closeDb, getDb } from "@/server/db/client";
import { exchangeRate } from "@/server/db/schema";
import { combinedStillToGive } from "@/server/fx/combined";
import { FX_PROVIDERS, type FxProvider } from "@/server/fx/providers";
import { FX_REFRESH_AFTER_MS, FX_RETRY_AFTER_FAILURE_MS, getUsdCadRate, pendingFxRefresh, resetFxStateForTests } from "@/server/fx/rates";
import { getOverview } from "@/server/read-models/overview";
import { createIncome } from "@/server/services/income";

import { createTestUser, resetAppData } from "./helpers/db";
import { ctxFor, key, noonToronto } from "./helpers/services";

const NOW = new Date("2026-10-03T16:00:00Z");

function bocBody(rate: string, d = "2026-10-02"): string {
  return JSON.stringify({ observations: [{ d, FXUSDCAD: { v: rate } }] });
}

/** A fetch double that answers per URL and records every call. */
function fakeFetch(answers: Record<string, () => Response>) {
  const calls: string[] = [];
  const impl = (async (url: string) => {
    calls.push(url);
    const answer = Object.entries(answers).find(([prefix]) => url.startsWith(prefix));
    if (!answer) throw new TypeError("network unreachable");
    return answer[1]();
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const BOC = FX_PROVIDERS[0]!.url.split("?")[0]!;
const ECB = FX_PROVIDERS[1]!.url.split("?")[0]!;

function balancesOwing(cad: number, usd: number): Record<Currency, CurrencyBalance> {
  return { CAD: { stillToGiveMinor: toMinor(cad) }, USD: { stillToGiveMinor: toMinor(usd) } } as Record<Currency, CurrencyBalance>;
}

beforeEach(async () => {
  await resetAppData();
  await getDb().delete(exchangeRate);
  delete process.env.TENTH_FX_TEST_RATE;
  resetFxStateForTests();
});

afterAll(async () => {
  await closeDb();
});

describe("getUsdCadRate", () => {
  it("fetches from the Bank of Canada, stores the rate and reuses it while fresh", async () => {
    const net = fakeFetch({ [BOC]: () => new Response(bocBody("1.3712")) });
    const first = await getUsdCadRate(NOW, { fetchImpl: net.impl });
    expect(first).toMatchObject({ rate: "1.3712", observedOn: "2026-10-02", source: "bank_of_canada", stale: false });

    const later = new Date(NOW.getTime() + FX_REFRESH_AFTER_MS - 60_000);
    const second = await getUsdCadRate(later, { fetchImpl: net.impl });
    expect(second?.rate).toBe("1.3712");
    expect(net.calls).toHaveLength(1);
    expect(await getDb().select().from(exchangeRate)).toHaveLength(1);
  });

  it("serves an older cached rate immediately and refreshes it in the background", async () => {
    await getUsdCadRate(NOW, { fetchImpl: fakeFetch({ [BOC]: () => new Response(bocBody("1.3712")) }).impl });
    const next = fakeFetch({ [BOC]: () => new Response(bocBody("1.3650", "2026-10-05")) });
    const later = new Date(NOW.getTime() + FX_REFRESH_AFTER_MS + 60_000);
    // The page never waits on the provider when a rate is stored: it gets the cached one right away...
    await expect(getUsdCadRate(later, { fetchImpl: next.impl })).resolves.toMatchObject({ rate: "1.3712" });
    // ...while the background refresh stores the new rate for the next request.
    await pendingFxRefresh();
    expect(next.calls).toHaveLength(1);
    await expect(getUsdCadRate(later, { fetchImpl: next.impl })).resolves.toMatchObject({ rate: "1.3650", observedOn: "2026-10-05" });
  });

  it("looks for a newer rate when the stored one is out of date, even if it was fetched recently", async () => {
    // A batch fetched today whose newest observation is 8 days old (e.g. picked from the wrong end of the list).
    await getUsdCadRate(NOW, { fetchImpl: fakeFetch({ [BOC]: () => new Response(bocBody("1.4145", "2026-09-25")) }).impl });
    const newer = fakeFetch({ [BOC]: () => new Response(bocBody("1.4101", "2026-10-01")) });
    const soon = new Date(NOW.getTime() + 60_000);
    await expect(getUsdCadRate(soon, { fetchImpl: newer.impl })).resolves.toMatchObject({ rate: "1.4145", stale: true });
    await pendingFxRefresh();
    expect(newer.calls).toHaveLength(1);
    await expect(getUsdCadRate(soon, { fetchImpl: newer.impl })).resolves.toMatchObject({ rate: "1.4101", stale: false });
  });

  it("does not ask the providers again for a while after they all failed", async () => {
    const down = fakeFetch({});
    await expect(getUsdCadRate(NOW, { fetchImpl: down.impl })).resolves.toBeNull();
    const callsAfterFirst = down.calls.length;
    await expect(getUsdCadRate(new Date(NOW.getTime() + 60_000), { fetchImpl: down.impl })).resolves.toBeNull();
    expect(down.calls).toHaveLength(callsAfterFirst);
    const up = fakeFetch({ [BOC]: () => new Response(bocBody("1.3712")) });
    const afterBackoff = new Date(NOW.getTime() + FX_RETRY_AFTER_FAILURE_MS + 60_000);
    await expect(getUsdCadRate(afterBackoff, { fetchImpl: up.impl })).resolves.toMatchObject({ rate: "1.3712" });
  });

  it("falls back to the ECB when the Bank of Canada is unreachable", async () => {
    const net = fakeFetch({ [ECB]: () => new Response(JSON.stringify({ base: "USD", date: "2026-10-02", rates: { CAD: 1.3705 } })) });
    const rate = await getUsdCadRate(NOW, { fetchImpl: net.impl });
    expect(rate).toMatchObject({ rate: "1.3705", source: "ecb_frankfurter" });
    expect(net.calls).toHaveLength(2);
  });

  it("returns the last cached rate, flagged stale, when every provider fails", async () => {
    await getUsdCadRate(NOW, { fetchImpl: fakeFetch({ [BOC]: () => new Response(bocBody("1.3712")) }).impl });
    const weekLater = new Date("2026-10-12T16:00:00Z");
    const rate = await getUsdCadRate(weekLater, { fetchImpl: fakeFetch({}).impl });
    expect(rate).toMatchObject({ rate: "1.3712", observedOn: "2026-10-02", stale: true });
    await pendingFxRefresh();
  });

  it("returns null when nothing is cached and every provider fails or answers garbage", async () => {
    const garbage: readonly FxProvider[] = FX_PROVIDERS;
    const net = fakeFetch({ [BOC]: () => new Response(bocBody("99.0")), [ECB]: () => new Response("{}", { status: 500 }) });
    await expect(getUsdCadRate(NOW, { fetchImpl: net.impl, providers: garbage })).resolves.toBeNull();
  });

  it("uses the pinned test rate only in test mode", async () => {
    process.env.TENTH_FX_TEST_RATE = "1.3500";
    const previous = process.env.TENTH_TEST_MODE;
    process.env.TENTH_TEST_MODE = "1";
    try {
      const net = fakeFetch({});
      await expect(getUsdCadRate(NOW, { fetchImpl: net.impl })).resolves.toMatchObject({ rate: "1.3500", source: "test_fixture" });
      expect(net.calls).toHaveLength(0);
    } finally {
      if (previous === undefined) delete process.env.TENTH_TEST_MODE;
      else process.env.TENTH_TEST_MODE = previous;
    }
  });
});

describe("combinedStillToGive", () => {
  it("never looks up a rate when nothing is owed in USD", async () => {
    const net = fakeFetch({});
    const vm = await combinedStillToGive(balancesOwing(15_000, 0), NOW, { fetchImpl: net.impl });
    expect(vm).toMatchObject({ status: "cad_only", totalCadMinor: 15_000, usdInCadMinor: 0, rate: null });
    expect(net.calls).toHaveLength(0);
  });

  it("converts USD at the day's rate and sums it with CAD", async () => {
    const net = fakeFetch({ [BOC]: () => new Response(bocBody("1.3500")) });
    const vm = await combinedStillToGive(balancesOwing(15_000, 1_000), NOW, { fetchImpl: net.impl });
    expect(vm).toMatchObject({
      status: "combined",
      totalCadMinor: 16_350,
      cadMinor: 15_000,
      usdMinor: 1_000,
      usdInCadMinor: 1_350,
      rate: { value: "1.3500", observedOn: "2026-10-02", sourceLabel: "Bank of Canada", stale: false },
    });
  });

  it("reports unavailable (never a wrong number) when USD is owed and no rate exists", async () => {
    const vm = await combinedStillToGive(balancesOwing(15_000, 1_000), NOW, { fetchImpl: fakeFetch({}).impl });
    expect(vm).toMatchObject({ status: "unavailable", totalCadMinor: null, usdInCadMinor: null, rate: null });
  });
});

describe("overview read model", () => {
  it("exposes the combined total next to the separate currencies", async () => {
    const owner = await createTestUser("fx-owner@example.test");
    const now = noonToronto("2026-10-03");
    await createIncome(ctxFor(owner, now), { idempotencyKey: key(), amount: "1,750.00", currency: "CAD", receivedOn: "2026-10-03" });
    await createIncome(ctxFor(owner, now), { idempotencyKey: key(), amount: "100.00", currency: "USD", receivedOn: "2026-10-03" });
    process.env.TENTH_FX_TEST_RATE = "1.3500";
    const previous = process.env.TENTH_TEST_MODE;
    process.env.TENTH_TEST_MODE = "1";
    try {
      const vm = await getOverview(ctxFor(owner, now));
      expect(vm.combined).toMatchObject({ status: "combined", totalCadMinor: 18_850, cadMinor: 17_500, usdMinor: 1_000 });
      expect(vm.headlines.find((h) => h.currency === "USD")?.stillToGiveMinor).toBe(1_000);
      expect(vm.headlines.find((h) => h.currency === "CAD")?.stillToGiveMinor).toBe(17_500);
    } finally {
      if (previous === undefined) delete process.env.TENTH_TEST_MODE;
      else process.env.TENTH_TEST_MODE = previous;
    }
  });
});
