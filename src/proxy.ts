import { NextResponse, type NextRequest } from "next/server";

import { AUTH_COOKIE_PREFIX, PUBLIC_AUTH_PATHS } from "@/server/auth/policy";
import { CLIENT_IP_HEADER, clientIpFromForwardedHeaders } from "@/server/security/client-ip";
import { buildCsp, generateNonce } from "@/server/security/csp";

/**
 * Runs before every page and API request (static assets and /api/health are excluded by the matcher).
 *
 * 1. Resolves the client IP once and forwards it upstream in CLIENT_IP_HEADER (overwriting anything the client
 *    sent), so Better Auth and the app limiter key on the same address.
 * 2. Pages only: per-request nonce CSP. Next.js reads the nonce from the request CSP header and applies it to its
 *    scripts; the same policy is sent to the browser. Pages are dynamically rendered (they read the session).
 * 3. Pages only: optimistic redirect to /sign-in when no session cookie is present. This is a UX shortcut, not
 *    a security check: every page, Server Action and route handler verifies the session itself.
 *
 * Kept cheap: no database access, no crypto beyond the nonce.
 */

const SESSION_COOKIE_NAMES = [`__Secure-${AUTH_COOKIE_PREFIX}.session_token`, `${AUTH_COOKIE_PREFIX}.session_token`];
const PUBLIC_PATHS: ReadonlySet<string> = new Set(PUBLIC_AUTH_PATHS);

function hasSessionCookie(request: NextRequest): boolean {
  return SESSION_COOKIE_NAMES.some((name) => Boolean(request.cookies.get(name)?.value));
}

function forwardedRequestHeaders(request: NextRequest): Headers {
  const headers = new Headers(request.headers);
  const ip = clientIpFromForwardedHeaders(request.headers);
  if (ip) headers.set(CLIENT_IP_HEADER, ip);
  else headers.delete(CLIENT_IP_HEADER);
  return headers;
}

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const requestHeaders = forwardedRequestHeaders(request);

  // API routes (Better Auth, exports): IP forwarding only. They answer JSON/files and enforce auth themselves.
  if (pathname === "/api" || pathname.startsWith("/api/")) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  if (!PUBLIC_PATHS.has(pathname) && !hasSessionCookie(request)) {
    const signIn = request.nextUrl.clone();
    signIn.pathname = "/sign-in";
    signIn.search = "";
    return NextResponse.redirect(signIn);
  }

  const nonce = generateNonce();
  const csp = buildCsp({
    nonce,
    isDev: process.env.NODE_ENV === "development",
    upgradeInsecureRequests: process.env.NODE_ENV === "production",
  });
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    // Everything except Next static output, image optimizer, the health check and files with a static extension.
    "/((?!_next/static|_next/image|api/health|.*\\.(?:ico|png|jpg|jpeg|gif|webp|avif|svg|txt|xml|webmanifest|woff2?|ttf|map)$).*)",
  ],
};
