/**
 * Client IP resolution for rate limiting. Pure and dependency-free so it runs in `src/proxy.ts` as well as in
 * Server Actions (no "server-only" import on purpose: the proxy bundle does not use the react-server condition).
 *
 * Render terminates TLS at its proxy and passes the visitor address as the first entry of `X-Forwarded-For`.
 * The proxy (src/proxy.ts) resolves it once per request and forwards it upstream in CLIENT_IP_HEADER, overwriting
 * any value the client sent, so Better Auth and our own limiter key on the same address.
 *
 * Caveat: Render's edge APPENDS to a client-supplied X-Forwarded-For rather than replacing it, so the first hop can
 * be chosen by the client. Per-IP limits are therefore a convenience for honest clients only; every credential
 * endpoint also has a deployment-wide limit that ignores the IP (src/server/security/auth-brake.ts, setup-global),
 * and 2FA has its own account lockout. Limits are a brute-force brake, not an authentication control.
 */

/** Request header carrying the resolved client IP from the proxy to route handlers, pages and actions. */
export const CLIENT_IP_HEADER = "x-tenth-client-ip";

const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const IPV6 = /^[0-9a-f:.]+$/i;

/** Returns the canonical IP for a syntactically valid IPv4/IPv6 literal (port and brackets stripped), else null. */
export function normalizeIp(raw: string): string | null {
  let value = raw.trim();
  if (value.length === 0 || value.length > 64) return null;
  // "[2001:db8::1]:443" -> "2001:db8::1"
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(value);
  if (bracketed?.[1]) value = bracketed[1];
  // "203.0.113.7:51234" -> "203.0.113.7"
  const v4WithPort = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(value);
  if (v4WithPort?.[1]) value = v4WithPort[1];
  if (IPV4.test(value)) return value;
  if (value.includes(":") && IPV6.test(value) && (value.match(/::/g)?.length ?? 0) <= 1) {
    const lower = value.toLowerCase();
    // IPv4-mapped IPv6 ("::ffff:192.0.2.1") collapses to the IPv4 form.
    const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(lower);
    if (mapped?.[1] && IPV4.test(mapped[1])) return mapped[1];
    return lower;
  }
  return null;
}

interface HeaderReader {
  get(name: string): string | null;
}

/** Resolves the client IP from forwarding headers: first X-Forwarded-For hop, then X-Real-IP. */
export function clientIpFromForwardedHeaders(headers: HeaderReader): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0];
    const ip = first ? normalizeIp(first) : null;
    if (ip) return ip;
  }
  const real = headers.get("x-real-ip");
  return real ? normalizeIp(real) : null;
}

/**
 * The client IP for the current request as seen by server code: the proxy-resolved header when present,
 * otherwise the forwarding headers, otherwise "unknown" (all unknown clients then share one bucket).
 */
export function requestClientIp(headers: HeaderReader): string {
  const fromProxy = headers.get(CLIENT_IP_HEADER);
  const resolved = (fromProxy ? normalizeIp(fromProxy) : null) ?? clientIpFromForwardedHeaders(headers);
  return resolved ?? "unknown";
}
