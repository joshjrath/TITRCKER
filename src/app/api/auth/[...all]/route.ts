import { toNextJsHandler } from "better-auth/next-js";

import { getAuth } from "@/server/auth/auth";
import { globalAuthLimitFor } from "@/server/security/auth-brake";
import { checkRateLimit } from "@/server/security/rate-limit";

// Better Auth owns every /api/auth/* endpoint (sign-in, sign-out, session, two-factor verification).
// The instance is resolved per request so `next build` never needs runtime secrets.
const handlers = toNextJsHandler((request: Request) => getAuth().handler(request));

/**
 * Credential-checking endpoints first pass a deployment-wide brake that does not depend on the (spoofable) client
 * IP; Better Auth's per-IP limits and the two-factor account lockout still apply after it. The 429 mirrors Better
 * Auth's own shape (`X-Retry-After`), which the sign-in forms already handle.
 */
async function withGlobalBrake(request: Request, next: (request: Request) => Promise<Response>): Promise<Response> {
  const limit = globalAuthLimitFor(request.method, new URL(request.url).pathname);
  if (limit) {
    const result = await checkRateLimit(limit.key, limit.rule);
    if (!result.ok) {
      return new Response(JSON.stringify({ code: "TOO_MANY_REQUESTS", message: "Too many requests. Please try again later." }), {
        status: 429,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Retry-After": String(result.retryAfterSeconds),
        },
      });
    }
  }
  return next(request);
}

export const GET = handlers.GET;
export async function POST(request: Request): Promise<Response> {
  return withGlobalBrake(request, handlers.POST);
}
