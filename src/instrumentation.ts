import type { Instrumentation } from "next";

/**
 * Runs once when a server instance starts (never during `next build`).
 * Production: redact database errors from console output, refuse to start with a broken environment (including
 * test mode without its explicit E2E opt-in), and warn loudly if the test clock override is enabled.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { findProductionEnvProblems, isTestModeEnabled } = await import("@/server/security/env-check");
  const { logEvent } = await import("@/server/log");

  if (process.env.NODE_ENV !== "production") return;

  // Errors that escape to the framework are printed by Next.js; strip SQL parameters / row data from them first.
  const { installLogRedaction } = await import("@/server/security/log-redaction");
  installLogRedaction();

  if (isTestModeEnabled()) {
    logEvent("warn", "startup.test_mode_enabled", {
      detail: "TENTH_TEST_MODE=1 in production: TENTH_TEST_NOW can override the clock. E2E builds only.",
    });
  }

  const problems = findProductionEnvProblems();
  for (const p of problems) {
    logEvent(p.severity === "error" ? "error" : "warn", "startup.env_check", { variable: p.variable, problem: p.problem });
  }
  const fatal = problems.filter((p) => p.severity === "error");
  if (fatal.length > 0) {
    throw new Error(`Invalid production environment: ${fatal.map((p) => p.variable).join(", ")}`);
  }
}

/** Server errors: log identifiers only (route, kind, digest). Messages may contain user data, so they are not logged. */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { logEvent } = await import("@/server/log");
  const digest =
    typeof error === "object" && error !== null && "digest" in error ? String((error as { digest: unknown }).digest) : null;
  logEvent("error", "request.error", {
    method: request.method,
    route: context.routePath,
    routeType: context.routeType,
    digest,
    errorName: error instanceof Error ? error.name : null,
  });
};
