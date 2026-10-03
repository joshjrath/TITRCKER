import { describe, expect, it } from "vitest";

import { CLIENT_IP_HEADER, clientIpFromForwardedHeaders, normalizeIp, requestClientIp } from "./client-ip";

describe("normalizeIp", () => {
  it.each([
    ["203.0.113.7", "203.0.113.7"],
    [" 203.0.113.7 ", "203.0.113.7"],
    ["203.0.113.7:51234", "203.0.113.7"],
    ["2001:DB8::1", "2001:db8::1"],
    ["[2001:db8::1]:443", "2001:db8::1"],
    ["::ffff:192.0.2.1", "192.0.2.1"],
  ])("%s -> %s", (raw, expected) => {
    expect(normalizeIp(raw)).toBe(expected);
  });

  it.each(["", "unknown", "999.1.1.1", "1.2.3", "evil.example", "1::2::3", "<script>"])("rejects %j", (raw) => {
    expect(normalizeIp(raw)).toBeNull();
  });
});

describe("clientIpFromForwardedHeaders", () => {
  it("uses the first X-Forwarded-For hop", () => {
    expect(clientIpFromForwardedHeaders(new Headers({ "x-forwarded-for": "198.51.100.4, 10.0.0.1, 10.0.0.2" }))).toBe(
      "198.51.100.4",
    );
  });

  it("falls back to X-Real-IP when the first hop is invalid or missing", () => {
    expect(clientIpFromForwardedHeaders(new Headers({ "x-forwarded-for": "garbage", "x-real-ip": "192.0.2.9" }))).toBe(
      "192.0.2.9",
    );
    expect(clientIpFromForwardedHeaders(new Headers({ "x-real-ip": "192.0.2.9" }))).toBe("192.0.2.9");
    expect(clientIpFromForwardedHeaders(new Headers())).toBeNull();
  });
});

describe("requestClientIp", () => {
  it("prefers the proxy-resolved header", () => {
    const h = new Headers({ [CLIENT_IP_HEADER]: "192.0.2.1", "x-forwarded-for": "198.51.100.4" });
    expect(requestClientIp(h)).toBe("192.0.2.1");
  });

  it("falls back to forwarding headers, then 'unknown'", () => {
    expect(requestClientIp(new Headers({ "x-forwarded-for": "198.51.100.4" }))).toBe("198.51.100.4");
    expect(requestClientIp(new Headers())).toBe("unknown");
  });
});
