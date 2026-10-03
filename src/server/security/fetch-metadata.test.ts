import { describe, expect, it } from "vitest";

import { isUserInitiatedRequest, SEC_FETCH_SITE_HEADER } from "./fetch-metadata";

const withSite = (value?: string) => new Headers(value === undefined ? {} : { [SEC_FETCH_SITE_HEADER]: value });

describe("isUserInitiatedRequest", () => {
  it.each(["same-origin", "none", "SAME-ORIGIN", " none "])("allows Sec-Fetch-Site %j", (value) => {
    expect(isUserInitiatedRequest(withSite(value))).toBe(true);
  });

  it("allows requests without the header (non-browser clients still need the session cookie)", () => {
    expect(isUserInitiatedRequest(withSite())).toBe(true);
  });

  it.each(["cross-site", "same-site", "Cross-Site"])("rejects Sec-Fetch-Site %j", (value) => {
    expect(isUserInitiatedRequest(withSite(value))).toBe(false);
  });
});
