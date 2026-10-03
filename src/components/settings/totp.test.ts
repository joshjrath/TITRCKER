import { describe, expect, it } from "vitest";

import { backupCodesFileName, backupCodesText, groupSecret, parseTotpUri } from "./totp";

describe("parseTotpUri", () => {
  it("reads the secret, issuer and account", () => {
    expect(
      parseTotpUri("otpauth://totp/Tenth:josh%40example.com?secret=jbswy3dpehpk3pxp&issuer=Tenth&algorithm=SHA1&digits=6&period=30"),
    ).toEqual({ secret: "JBSWY3DPEHPK3PXP", issuer: "Tenth", account: "josh@example.com" });
  });

  it("falls back to the label issuer and strips padding", () => {
    expect(parseTotpUri("otpauth://totp/Tenth%3Ajosh%40example.com?secret=JBSW%20Y3DP%3D%3D")).toEqual({
      secret: "JBSWY3DP",
      issuer: "Tenth",
      account: "josh@example.com",
    });
  });

  it("returns nulls for other URIs or invalid secrets", () => {
    expect(parseTotpUri("https://example.com/?secret=ABC")).toEqual({ secret: null, issuer: null, account: null });
    expect(parseTotpUri("otpauth://totp/x?secret=not-base32!").secret).toBeNull();
    expect(parseTotpUri("otpauth://totp/%E0%A4%A?secret=ABCD").account).toBeNull();
  });
});

describe("groupSecret", () => {
  it("splits into groups of four", () => {
    expect(groupSecret("JBSWY3DPEHPK3PXP")).toBe("JBSW Y3DP EHPK 3PXP");
    expect(groupSecret("ABCDEF")).toBe("ABCD EF");
    expect(groupSecret("")).toBe("");
  });
});

describe("backup codes file", () => {
  it("lists every code with a safety note", () => {
    const text = backupCodesText({ codes: ["aaaa-bbbb", "cccc-dddd"], account: "josh@example.com", createdOn: "2026-10-03" });
    expect(text).toContain("Account: josh@example.com");
    expect(text).toContain("Created: 2026-10-03");
    expect(text).toContain("Each code works once");
    expect(text.trimEnd().split("\n").slice(-2)).toEqual(["aaaa-bbbb", "cccc-dddd"]);
    expect(backupCodesFileName("2026-10-03")).toBe("tenth-backup-codes-2026-10-03.txt");
  });
});
