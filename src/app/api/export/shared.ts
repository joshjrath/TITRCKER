import "server-only";

import { getOwner, type OwnerContext } from "@/server/auth/session";
import { logEvent } from "@/server/log";
import { isUserInitiatedRequest } from "@/server/security/fetch-metadata";
import { checkRateLimit, RATE_LIMITS } from "@/server/security/rate-limit";

/** Headers for every export response (financial data: never cached, never sniffed). */
export const PRIVATE_DOWNLOAD_HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
} as const;

export function jsonError(status: number, code: string, message: string, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ ok: false, code, message }), {
    status,
    headers: { ...PRIVATE_DOWNLOAD_HEADERS, "Content-Type": "application/json; charset=utf-8", ...extra },
  });
}

export function attachment(filename: string): string {
  // Filenames are generated server-side from a date (ASCII only), so a plain quoted value is safe.
  return `attachment; filename="${filename}"`;
}

/**
 * Refuses downloads another site started (Sec-Fetch-Site cross-site/same-site), then authenticates the session owner
 * and applies the export rate limit (`export:<ownerId>`). Returns the owner, or the 403/401/429 response to send.
 */
export async function authorizeExport(request: Request): Promise<{ owner: OwnerContext } | { response: Response }> {
  if (!isUserInitiatedRequest(request.headers)) {
    return { response: jsonError(403, "forbidden", "Start the export from Tenth itself.") };
  }
  const owner = await getOwner();
  if (!owner) return { response: jsonError(401, "unauthorized", "Sign in to export your data.") };
  const limit = await checkRateLimit(`export:${owner.ownerId}`, RATE_LIMITS.export);
  if (!limit.ok) {
    return {
      response: jsonError(429, "rate_limited", "Too many exports in a short time. Try again in a few minutes.", {
        "Retry-After": String(limit.retryAfterSeconds),
      }),
    };
  }
  return { owner };
}

/** Logs a failed export without any data, and returns a generic 500. */
export function exportFailed(operation: string, err: unknown): Response {
  logEvent("error", "export.failed", { operation, error: err instanceof Error ? err.name : typeof err });
  return jsonError(500, "server_error", "The export could not be created. Try again.");
}
