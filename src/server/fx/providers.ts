/**
 * Public USD→CAD reference-rate providers. Pure response parsers (unit-tested) plus a hardened fetch helper.
 * No credentials, cookies or personal data are ever sent: these are fixed public URLs.
 */
import { parseFxRate, parseLocalDate, type FxSource, type LocalDate } from "@/domain";

export interface ProviderRate {
  rate: string;
  observedOn: LocalDate;
  source: Exclude<FxSource, "test_fixture">;
}

export interface FxProvider {
  source: ProviderRate["source"];
  url: string;
  parse(body: unknown): ProviderRate | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

/** Bank of Canada Valet: `{ observations: [{ d: "2026-10-02", FXUSDCAD: { v: "1.3712" } }] }` (latest last). */
export function parseBankOfCanada(body: unknown): ProviderRate | null {
  if (!isRecord(body) || !Array.isArray(body.observations)) return null;
  for (let i = body.observations.length - 1; i >= 0; i -= 1) {
    const observation: unknown = body.observations[i];
    if (!isRecord(observation) || typeof observation.d !== "string") continue;
    const series = observation.FXUSDCAD;
    if (!isRecord(series) || typeof series.v !== "string") continue;
    const observedOn = parseLocalDate(observation.d);
    const rate = series.v.trim();
    if (observedOn && parseFxRate(rate)) return { rate, observedOn, source: "bank_of_canada" };
  }
  return null;
}

/** Frankfurter (ECB): `{ base: "USD", date: "2026-10-02", rates: { CAD: 1.3712 } }`. */
export function parseFrankfurter(body: unknown): ProviderRate | null {
  if (!isRecord(body) || body.base !== "USD" || typeof body.date !== "string" || !isRecord(body.rates)) return null;
  const value = body.rates.CAD;
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  // JSON numbers with ≤ 8 decimals print back exactly; reject exponent forms ("1e-7") and anything unparseable.
  const rate = String(value);
  const observedOn = parseLocalDate(body.date);
  if (!observedOn || !parseFxRate(rate)) return null;
  return { rate, observedOn, source: "ecb_frankfurter" };
}

export const FX_PROVIDERS: readonly FxProvider[] = [
  {
    source: "bank_of_canada",
    url: "https://www.bankofcanada.ca/valet/observations/FXUSDCAD/json?recent=5",
    parse: parseBankOfCanada,
  },
  {
    source: "ecb_frankfurter",
    url: "https://api.frankfurter.app/latest?from=USD&to=CAD",
    parse: parseFrankfurter,
  },
];

const FETCH_TIMEOUT_MS = 3_000;
const MAX_BODY_BYTES = 64 * 1024;

/** Fetches and parses one provider. Returns null on any network, size, status or format problem. */
export async function fetchProviderRate(provider: FxProvider, fetchImpl: typeof fetch = fetch): Promise<ProviderRate | null> {
  try {
    const response = await fetchImpl(provider.url, {
      cache: "no-store",
      credentials: "omit",
      headers: { accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const text = await response.text();
    if (text.length > MAX_BODY_BYTES) return null;
    return provider.parse(JSON.parse(text));
  } catch {
    return null;
  }
}
