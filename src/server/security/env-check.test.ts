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

  it("only warns about a short setup token", () => {
    expect(findProductionEnvProblems({ ...good, OWNER_SETUP_TOKEN: "abc" })).toEqual([
      expect.objectContaining({ variable: "OWNER_SETUP_TOKEN", severity: "warning" }),
    ]);
  });
});
