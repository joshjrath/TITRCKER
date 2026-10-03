import { describe, expect, it } from "vitest";

import { findProductionEnvProblems } from "./env-check";

const good = {
  NODE_ENV: "production",
  DATABASE_URL: "postgres://u:p@host/db",
  BETTER_AUTH_SECRET: "x".repeat(32),
  BETTER_AUTH_URL: "https://tenth.example",
  OWNER_EMAIL: "owner@example.com",
} as NodeJS.ProcessEnv;

describe("findProductionEnvProblems", () => {
  it("accepts a complete environment", () => {
    expect(findProductionEnvProblems(good)).toEqual([]);
  });

  it("accepts Render's RENDER_EXTERNAL_URL instead of BETTER_AUTH_URL", () => {
    expect(findProductionEnvProblems({ ...good, BETTER_AUTH_URL: undefined, RENDER_EXTERNAL_URL: "https://tenth.onrender.com" })).toEqual([]);
  });

  it("flags missing or weak required variables as errors, without echoing values", () => {
    const problems = findProductionEnvProblems({ NODE_ENV: "production", BETTER_AUTH_SECRET: "short-secret", OWNER_EMAIL: "nope" } as NodeJS.ProcessEnv);
    expect(problems.map((p) => p.variable).sort()).toEqual(["BETTER_AUTH_SECRET", "BETTER_AUTH_URL", "DATABASE_URL", "OWNER_EMAIL"]);
    expect(problems.every((p) => p.severity === "error")).toBe(true);
    expect(JSON.stringify(problems)).not.toContain("short-secret");
  });

  it.each([
    ["BETTER_AUTH_URL", { BETTER_AUTH_URL: "http://tenth.example" }],
    ["RENDER_EXTERNAL_URL", { BETTER_AUTH_URL: undefined, RENDER_EXTERNAL_URL: "http://tenth.onrender.com" }],
    ["BETTER_AUTH_URL", { BETTER_AUTH_URL: "http://192.168.1.20:3000" }],
  ])("rejects a plain-http public origin in production (%s)", (variable, overrides) => {
    expect(findProductionEnvProblems({ ...good, ...overrides })).toEqual([
      expect.objectContaining({ variable, severity: "error", problem: expect.stringContaining("https") }),
    ]);
  });

  it.each(["http://localhost:3100", "http://127.0.0.1:3000", "http://[::1]:3000"])("allows plain http on loopback (%s)", (url) => {
    expect(findProductionEnvProblems({ ...good, BETTER_AUTH_URL: url })).toEqual([]);
  });

  it("does not flag http outside production", () => {
    expect(findProductionEnvProblems({ ...good, NODE_ENV: "development", BETTER_AUTH_URL: "http://tenth.example" })).toEqual([]);
  });

  it("makes test mode in production fatal unless the E2E opt-in is set", () => {
    expect(findProductionEnvProblems({ ...good, TENTH_TEST_MODE: "1" })).toEqual([
      expect.objectContaining({ variable: "TENTH_TEST_MODE", severity: "error" }),
    ]);
    expect(findProductionEnvProblems({ ...good, TENTH_TEST_MODE: "1", TENTH_ALLOW_TEST_MODE_IN_PRODUCTION: "1" })).toEqual([]);
    expect(findProductionEnvProblems({ ...good, TENTH_ALLOW_TEST_MODE_IN_PRODUCTION: "1" })).toEqual([]);
    expect(findProductionEnvProblems({ ...good, NODE_ENV: "test", TENTH_TEST_MODE: "1" })).toEqual([]);
  });

  it("only warns about a short setup token", () => {
    expect(findProductionEnvProblems({ ...good, OWNER_SETUP_TOKEN: "abc" })).toEqual([
      expect.objectContaining({ variable: "OWNER_SETUP_TOKEN", severity: "warning" }),
    ]);
  });
});
