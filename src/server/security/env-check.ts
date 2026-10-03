import "server-only";

import { isLoopbackHttp, MIN_SECRET_LENGTH, MIN_SETUP_TOKEN_LENGTH } from "@/server/auth/config";

export interface EnvProblem {
  variable: string;
  problem: string;
  /** "error" stops the server from starting; "warning" is logged only. */
  severity: "error" | "warning";
}

/**
 * Validates the runtime environment of a production server. Returns the problems found (names and reasons only;
 * values are never echoed). Called from instrumentation register() at server start.
 */
export function findProductionEnvProblems(env: NodeJS.ProcessEnv = process.env): EnvProblem[] {
  const problems: EnvProblem[] = [];
  if (!env.DATABASE_URL?.trim()) problems.push({ variable: "DATABASE_URL", problem: "is not set", severity: "error" });

  const secret = env.BETTER_AUTH_SECRET ?? "";
  if (secret.length < MIN_SECRET_LENGTH) {
    problems.push({ variable: "BETTER_AUTH_SECRET", problem: `must be at least ${MIN_SECRET_LENGTH} characters`, severity: "error" });
  }

  const explicitUrl = env.BETTER_AUTH_URL?.trim();
  const baseUrl = explicitUrl || env.RENDER_EXTERNAL_URL?.trim();
  const baseUrlVariable = explicitUrl ? "BETTER_AUTH_URL" : "RENDER_EXTERNAL_URL";
  if (!baseUrl) {
    problems.push({ variable: "BETTER_AUTH_URL", problem: "is not set (and RENDER_EXTERNAL_URL is not available)", severity: "error" });
  } else if (!URL.canParse(baseUrl)) {
    problems.push({ variable: baseUrlVariable, problem: "is not a valid absolute URL", severity: "error" });
  } else if (isPlainHttpPublicOrigin(baseUrl, env)) {
    // Session cookies would travel unencrypted. Plain http is accepted only on loopback (local `next start`, E2E).
    problems.push({ variable: baseUrlVariable, problem: "must use https:// in production (http is allowed only for localhost)", severity: "error" });
  }

  const ownerEmail = env.OWNER_EMAIL?.trim();
  if (!ownerEmail) {
    problems.push({ variable: "OWNER_EMAIL", problem: "is not set", severity: "error" });
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) {
    problems.push({ variable: "OWNER_EMAIL", problem: "is not a valid email address", severity: "error" });
  }

  const setupToken = env.OWNER_SETUP_TOKEN?.trim();
  if (setupToken && setupToken.length < MIN_SETUP_TOKEN_LENGTH) {
    problems.push({
      variable: "OWNER_SETUP_TOKEN",
      problem: `is shorter than ${MIN_SETUP_TOKEN_LENGTH} characters, so /setup stays disabled`,
      severity: "warning",
    });
  }

  if (env.NODE_ENV === "production" && isTestModeEnabled(env) && !isTestModeAllowedInProduction(env)) {
    problems.push({
      variable: "TENTH_TEST_MODE",
      problem: "is on in production (TENTH_TEST_NOW could override the clock); unset it",
      severity: "error",
    });
  }
  return problems;
}

function isPlainHttpPublicOrigin(origin: string, env: NodeJS.ProcessEnv): boolean {
  return env.NODE_ENV === "production" && new URL(origin).protocol === "http:" && !isLoopbackHttp(origin);
}

/** True when the test clock override is enabled (must never be on in a real deployment). */
export function isTestModeEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.TENTH_TEST_MODE === "1";
}

/**
 * The E2E server runs a production build in test mode; it opts in with TENTH_ALLOW_TEST_MODE_IN_PRODUCTION=1.
 * Without that second flag, test mode in production stops the server from starting.
 */
export function isTestModeAllowedInProduction(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.TENTH_ALLOW_TEST_MODE_IN_PRODUCTION === "1";
}
