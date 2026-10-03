import "server-only";

/**
 * Single source of "now" for the server.
 *
 * Production always uses the real system clock. Automated tests can pin the clock with
 * TENTH_TEST_NOW (an ISO-8601 instant), which is honored only when TENTH_TEST_MODE=1.
 */
export function now(): Date {
  if (process.env.TENTH_TEST_MODE === "1" && process.env.TENTH_TEST_NOW) {
    const pinned = new Date(process.env.TENTH_TEST_NOW);
    if (!Number.isNaN(pinned.getTime())) return pinned;
  }
  return new Date();
}
