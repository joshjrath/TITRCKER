import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { toMinor, type CurrencyBalance, type Currency } from "@/domain";
import { closeDb, getDb } from "@/server/db/client";
import { exchangeRate } from "@/server/db/schema";
import { combinedStillToGive } from "@/server/fx/combined";
import { FX_PROVIDERS, type FxProvider } from "@/server/fx/providers";
import { FX_REFRESH_AFTER_MS, FX_RETRY_AFTER_FAILURE_MS, getUsdCadRate, pendingFxRefresh, resetFxStateForTests } from "@/server/fx/rates";
import { getGiven } from "@/server/read-models/given";
import { getLedger } from "@/server/read-models/ledger";
import { getOverview } from "@/server/read-models/overview";
import { createIncome } from "@/server/services/income";
import { recordPayment } from "@/server/services/payments";

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

/** Runs `fn` with the pinned test rate (TENTH_FX_TEST_RATE honoured only in test mode). */
async function withTestRate<T>(rate: string, fn: () => Promise<T>): Promise<T> {
  process.env.TENTH_FX_TEST_RATE = rate;
  const previous = process.env.TENTH_TEST_MODE;
  process.env.TENTH_TEST_MODE = "1";
  try {
    return await fn();
  } finally {
    delete process.env.TENTH_FX_TEST_RATE;
    if (previous === undefined) delete process.env.TENTH_TEST_MODE;
    else process.env.TENTH_TEST_MODE = previous;
  }
}

describe("combined period figures and ledger totals (display-only)", () => {
  const today = "2026-10-03";

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function ownerReport() {
    // The owner's report: CAD 4,703.00 + 500.00 and USD 1,750.00 received on Oct 3, nothing given yet.
    const owner = await createTestUser("fx-period@example.test");
    const ctx = ctxFor(owner, noonToronto(today));
    await createIncome(ctx, { idempotencyKey: key(), amount: "4,703.00", currency: "CAD", receivedOn: today, source: "Ash" });
    await createIncome(ctx, { idempotencyKey: key(), amount: "500.00", currency: "CAD", receivedOn: today, source: "Ammama" });
    await createIncome(ctx, { idempotencyKey: key(), amount: "1,750.00", currency: "USD", receivedOn: today, source: "Scale Media" });
    return ctx;
  }

  it("shows the selected period in CAD with USD converted, next to each currency's own figures", async () => {
    const ctx = await ownerReport();
    const vm = await withTestRate("1.4145", () => getOverview(ctx, { currency: "CAD" }));
    // The selected currency still drives the chart and the per-currency summary...
    expect(vm.currency).toBe("CAD");
    expect(vm.periodSummary).toMatchObject({ currency: "CAD", netIncomeMinor: 520_300, accruedMinor: 52_030, entryCount: 2 });
    // ...both currencies' period figures are available...
    expect(vm.periodSummaries.CAD).toMatchObject({ netIncomeMinor: 520_300, accruedMinor: 52_030, givenMinor: 0, entryCount: 2 });
    expect(vm.periodSummaries.USD).toMatchObject({ netIncomeMinor: 175_000, accruedMinor: 17_500, givenMinor: 0, entryCount: 1 });
    expect(vm.periodBuckets.CAD?.year).toBe(2026);
    expect(vm.periodBuckets.USD?.year).toBe(2026);
    // ...and combined in CAD: USD 1,750.00 × 1.4145 = 2,475.375 → 2,475.38; USD 175.00 × 1.4145 = 247.5375 → 247.54.
    expect(vm.combinedPeriod).toEqual({
      status: "combined",
      incomeCad: { totalCadMinor: 767_838, cadMinor: 520_300, usdMinor: 175_000, usdInCadMinor: 247_538 },
      accruedCad: { totalCadMinor: 76_784, cadMinor: 52_030, usdMinor: 17_500, usdInCadMinor: 24_754 },
      givenCad: { totalCadMinor: 0, cadMinor: 0, usdMinor: 0, usdInCadMinor: 0 },
      rate: { value: "1.4145", observedOn: expect.any(String), sourceLabel: "Test rate", stale: false },
    });
    // The combined still-to-give is unchanged: CAD 520.30 + USD 175.00 → CAD 767.84.
    expect(vm.combined).toMatchObject({ status: "combined", totalCadMinor: 76_784, cadMinor: 52_030, usdMinor: 17_500, usdInCadMinor: 24_754 });

    // Switching the chart currency to USD does not change the combined figures.
    const usdView = await withTestRate("1.4145", () => getOverview(ctx, { currency: "USD" }));
    expect(usdView.periodSummary.currency).toBe("USD");
    expect(usdView.combinedPeriod).toEqual(vm.combinedPeriod);
  });

  it("gives the Ledger the display rate whenever USD has activity", async () => {
    const ctx = await ownerReport();
    const vm = await withTestRate("1.4145", () => getLedger(ctx));
    expect(vm.displayRate).toMatchObject({ value: "1.4145", sourceLabel: "Test rate" });
    expect(vm.combined).toMatchObject({ status: "combined", totalCadMinor: 76_784 });
  });

  it("looks the rate up when USD has activity even though nothing is owed in USD", async () => {
    const owner = await createTestUser("fx-paid@example.test");
    const ctx = ctxFor(owner, noonToronto(today));
    await createIncome(ctx, { idempotencyKey: key(), amount: "1,750.00", currency: "CAD", receivedOn: today });
    await createIncome(ctx, { idempotencyKey: key(), amount: "100.00", currency: "USD", receivedOn: today });
    await recordPayment(ctx, {
      idempotencyKey: key(),
      amount: "10.00",
      currency: "USD",
      paidOn: today,
      churchName: "Grace",
      allocations: "auto",
      confirmCredit: false,
      confirmMadePayment: true,
      drawFromSetAside: false,
    });
    const vm = await withTestRate("1.3500", () => getOverview(ctx));
    // Nothing owed in USD: the still-to-give stays CAD only (no rate shown there)...
    expect(vm.combined).toMatchObject({ status: "cad_only", totalCadMinor: 17_500, rate: null });
    // ...but the period figures still combine: given CAD 0 + USD 10.00 × 1.35 = CAD 13.50.
    expect(vm.combinedPeriod.status).toBe("combined");
    expect(vm.combinedPeriod.incomeCad?.totalCadMinor).toBe(175_000 + 13_500);
    expect(vm.combinedPeriod.accruedCad?.totalCadMinor).toBe(17_500 + 1_350);
    expect(vm.combinedPeriod.givenCad).toEqual({ totalCadMinor: 1_350, cadMinor: 0, usdMinor: 1_000, usdInCadMinor: 1_350 });
    const ledger = await withTestRate("1.3500", () => getLedger(ctx));
    expect(ledger.displayRate?.value).toBe("1.3500");
  });

  it("reports the period figures as unavailable (never a guess) when no rate can be obtained", async () => {
    const ctx = await ownerReport();
    const calls: string[] = [];
    vi.stubGlobal("fetch", (async (url: string) => {
      calls.push(url);
      throw new TypeError("network unreachable");
    }) as unknown as typeof fetch);
    const vm = await getOverview(ctx, { currency: "CAD" });
    expect(calls.length).toBeGreaterThan(0);
    expect(vm.combinedPeriod).toEqual({ status: "unavailable", incomeCad: null, accruedCad: null, givenCad: null, rate: null });
    expect(vm.combined).toMatchObject({ status: "unavailable", totalCadMinor: null });
    // The selected currency's figures are still there, unconverted.
    expect(vm.periodSummary).toMatchObject({ currency: "CAD", netIncomeMinor: 520_300 });
    const ledger = await getLedger(ctx);
    expect(ledger.displayRate).toBeNull();
  });

  it("makes no outbound request and needs no conversion for a CAD-only owner", async () => {
    const owner = await createTestUser("fx-cad-only@example.test");
    const ctx = ctxFor(owner, noonToronto(today));
    await createIncome(ctx, { idempotencyKey: key(), amount: "1,750.00", currency: "CAD", receivedOn: today });
    const calls: string[] = [];
    vi.stubGlobal("fetch", (async (url: string) => {
      calls.push(url);
      throw new TypeError("network unreachable");
    }) as unknown as typeof fetch);
    const overview = await getOverview(ctx);
    const ledger = await getLedger(ctx);
    const given = await getGiven(ctx);
    expect(calls).toEqual([]);
    expect(overview.combinedPeriod.status).toBe("single_currency");
    expect(overview.combined).toMatchObject({ status: "cad_only", totalCadMinor: 17_500 });
    expect(ledger.displayRate).toBeNull();
    expect(given.combined.status).toBe("cad_only");
  });

  it("keeps a period with only the selected currency active as it is, and converts one with only the other", async () => {
    const owner = await createTestUser("fx-one-period@example.test");
    // USD income in 2026, CAD income only in 2027: each year has one active currency.
    await createIncome(ctxFor(owner, noonToronto("2026-10-03")), { idempotencyKey: key(), amount: "100.00", currency: "USD", receivedOn: "2026-10-03" });
    await createIncome(ctxFor(owner, noonToronto("2027-01-05")), { idempotencyKey: key(), amount: "200.00", currency: "CAD", receivedOn: "2027-01-05" });
    const ctx = ctxFor(owner, noonToronto("2027-01-05"));
    const y2027 = await withTestRate("1.3500", () => getOverview(ctx, { period: "2027", currency: "CAD" }));
    expect(y2027.combinedPeriod.status).toBe("single_currency");
    // USD selected in a CAD-only year: the CAD income is still counted (exact, no rate needed).
    const y2027usd = await withTestRate("1.3500", () => getOverview(ctx, { period: "2027", currency: "USD" }));
    expect(y2027usd.combinedPeriod).toMatchObject({
      status: "combined",
      incomeCad: { totalCadMinor: 20_000, cadMinor: 20_000, usdMinor: 0, usdInCadMinor: 0 },
      rate: null,
    });
    // CAD selected in a USD-only year: the USD income is converted rather than shown as CAD 0.00.
    const y2026 = await withTestRate("1.3500", () => getOverview(ctx, { period: "2026", currency: "CAD" }));
    expect(y2026.combinedPeriod.status).toBe("combined");
    expect(y2026.combinedPeriod.incomeCad).toEqual({ totalCadMinor: 13_500, cadMinor: 0, usdMinor: 10_000, usdInCadMinor: 13_500 });
    expect(y2026.combinedPeriod.rate?.value).toBe("1.3500");
    const all = await withTestRate("1.3500", () => getOverview(ctx, { period: "all", currency: "CAD" }));
    expect(all.combinedPeriod.status).toBe("combined");
    expect(all.combinedPeriod.incomeCad?.totalCadMinor).toBe(20_000 + 13_500);
    expect(all.periodBuckets).toEqual({ CAD: null, USD: null });
  });
});
