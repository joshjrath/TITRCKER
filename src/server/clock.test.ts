import { afterEach, describe, expect, it, vi } from "vitest";

import { now } from "./clock";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("now", () => {
  it("uses the real clock without test mode, even when TENTH_TEST_NOW is set", () => {
    vi.useFakeTimers({ now: new Date("2031-05-06T07:08:09Z") });
    vi.stubEnv("TENTH_TEST_MODE", "");
    vi.stubEnv("TENTH_TEST_NOW", "2026-10-10T16:00:00Z");
    expect(now().toISOString()).toBe("2031-05-06T07:08:09.000Z");
  });

  it("pins the clock to a valid ISO instant in test mode", () => {
    vi.stubEnv("TENTH_TEST_MODE", "1");
    vi.stubEnv("TENTH_TEST_NOW", "2026-10-10T16:00:00Z");
    expect(now().toISOString()).toBe("2026-10-10T16:00:00.000Z");
  });

  it("falls back to the real clock when TENTH_TEST_NOW is not a valid instant", () => {
    vi.useFakeTimers({ now: new Date("2031-05-06T07:08:09Z") });
    vi.stubEnv("TENTH_TEST_MODE", "1");
    vi.stubEnv("TENTH_TEST_NOW", "not-a-date");
    expect(now().toISOString()).toBe("2031-05-06T07:08:09.000Z");
  });

  it("returns a fresh Date each call (callers may mutate it)", () => {
    vi.stubEnv("TENTH_TEST_MODE", "1");
    vi.stubEnv("TENTH_TEST_NOW", "2026-10-10T16:00:00Z");
    expect(now()).not.toBe(now());
  });
});
