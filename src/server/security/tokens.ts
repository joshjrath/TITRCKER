import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Constant-time string comparison for secrets (setup token and similar).
 * Both inputs are hashed first so the comparison takes the same time whatever their lengths,
 * and neither the length nor a matching prefix leaks through timing.
 */
export function constantTimeEqual(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  // Evaluate both checks so an empty expected value never short-circuits differently.
  const sameDigest = timingSafeEqual(a, b);
  return sameDigest && expected.length > 0;
}
