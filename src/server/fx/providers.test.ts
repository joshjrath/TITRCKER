import { describe, expect, it } from "vitest";

import { fetchProviderRate, FX_PROVIDERS, parseBankOfCanada, parseFrankfurter } from "./providers";

describe("parseBankOfCanada", () => {
  it("reads the newest valid observation", () => {
    const body = {
      terms: { url: "https://www.bankofcanada.ca/terms/" },
      seriesDetail: { FXUSDCAD: { label: "USD/CAD" } },
      observations: [
        { d: "2026-09-30", FXUSDCAD: { v: "1.3690" } },
        { d: "2026-10-01", FXUSDCAD: { v: "1.3701" } },
        { d: "2026-10-02", FXUSDCAD: { v: "1.3712" } },
      ],
    };
    expect(parseBankOfCanada(body)).toEqual({ rate: "1.3712", observedOn: "2026-10-02", source: "bank_of_canada" });
  });

  it("picks the newest observation even when the API lists newest first", () => {
    const body = {
      observations: [
        { d: "2026-10-01", FXUSDCAD: { v: "1.4101" } },
        { d: "2026-09-30", FXUSDCAD: { v: "1.4120" } },
        { d: "2026-09-29", FXUSDCAD: { v: "1.4133" } },
        { d: "2026-09-26", FXUSDCAD: { v: "1.4140" } },
        { d: "2026-09-25", FXUSDCAD: { v: "1.4145" } },
      ],
    };
    expect(parseBankOfCanada(body)).toEqual({ rate: "1.4101", observedOn: "2026-10-01", source: "bank_of_canada" });
  });

  it("skips malformed trailing observations", () => {
    const body = {
      observations: [
        { d: "2026-10-01", FXUSDCAD: { v: "1.3701" } },
        { d: "2026-10-02", FXUSDCAD: { v: "" } },
        { d: "not-a-date", FXUSDCAD: { v: "1.37" } },
      ],
    };
    expect(parseBankOfCanada(body)?.rate).toBe("1.3701");
  });

  it.each([null, "x", {}, { observations: "no" }, { observations: [{ d: "2026-10-02", FXUSDCAD: { v: "13.712" } }] }])(
    "rejects %j",
    (body) => {
      expect(parseBankOfCanada(body)).toBeNull();
    },
  );
});

describe("parseFrankfurter", () => {
  it("reads the CAD rate", () => {
    expect(parseFrankfurter({ amount: 1, base: "USD", date: "2026-10-02", rates: { CAD: 1.3712 } })).toEqual({
      rate: "1.3712",
      observedOn: "2026-10-02",
      source: "ecb_frankfurter",
    });
  });

  it.each([
    { base: "EUR", date: "2026-10-02", rates: { CAD: 1.5 } },
    { base: "USD", date: "2026-10-02", rates: { CAD: "1.37" } },
    { base: "USD", date: "2026-10-02", rates: { CAD: 1e-7 } },
    { base: "USD", date: "2026-10-02", rates: { CAD: 42 } },
    { base: "USD", date: "nope", rates: { CAD: 1.37 } },
  ])("rejects %j", (body) => {
    expect(parseFrankfurter(body)).toBeNull();
  });
});

describe("fetchProviderRate", () => {
  const boc = FX_PROVIDERS[0]!;
  const respond = (body: string, status = 200): typeof fetch =>
    (async () => new Response(body, { status })) as unknown as typeof fetch;

  it("returns the parsed rate", async () => {
    const body = JSON.stringify({ observations: [{ d: "2026-10-02", FXUSDCAD: { v: "1.3712" } }] });
    await expect(fetchProviderRate(boc, respond(body))).resolves.toMatchObject({ rate: "1.3712" });
  });

  it("returns null on HTTP errors, bad JSON, oversized bodies and network failures", async () => {
    await expect(fetchProviderRate(boc, respond("{}", 503))).resolves.toBeNull();
    await expect(fetchProviderRate(boc, respond("not json"))).resolves.toBeNull();
    await expect(fetchProviderRate(boc, respond("x".repeat(70_000)))).resolves.toBeNull();
    const failing = (async () => {
      throw new TypeError("network down");
    }) as unknown as typeof fetch;
    await expect(fetchProviderRate(boc, failing)).resolves.toBeNull();
  });

  it("sends no credentials and refuses redirects", async () => {
    let init: RequestInit | undefined;
    const capture = (async (_url: string, options?: RequestInit) => {
      init = options;
      return new Response(JSON.stringify({ observations: [] }));
    }) as unknown as typeof fetch;
    await fetchProviderRate(boc, capture);
    expect(init).toMatchObject({ credentials: "omit", redirect: "error", cache: "no-store" });
  });
});
