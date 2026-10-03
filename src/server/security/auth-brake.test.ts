import { describe, expect, it } from "vitest";

import { GLOBAL_AUTH_LIMITS, globalAuthLimitFor } from "./auth-brake";

describe("globalAuthLimitFor", () => {
  it("applies to POSTs of every credential-checking endpoint", () => {
    for (const path of Object.keys(GLOBAL_AUTH_LIMITS)) {
      const limit = globalAuthLimitFor("POST", `/api/auth${path}`);
      expect(limit, path).not.toBeNull();
      expect(limit?.key).toBe(`auth-global:${path}`);
    }
  });

  it("cannot be dodged by case, repeated or trailing slashes", () => {
    for (const spelling of [
      "/api/auth/sign-in/email/",
      "/api/auth//sign-in/email",
      "/API/Auth/Sign-In/Email",
      "//api/auth/sign-in//email///",
    ]) {
      expect(globalAuthLimitFor("post", spelling)?.key, spelling).toBe("auth-global:/sign-in/email");
    }
  });

  it("ignores other methods, other endpoints and paths outside /api/auth", () => {
    expect(globalAuthLimitFor("GET", "/api/auth/sign-in/email")).toBeNull();
    expect(globalAuthLimitFor("POST", "/api/auth/get-session")).toBeNull();
    expect(globalAuthLimitFor("POST", "/api/auth/sign-out")).toBeNull();
    expect(globalAuthLimitFor("POST", "/sign-in/email")).toBeNull();
    expect(globalAuthLimitFor("POST", "/api/authsign-in/email")).toBeNull();
  });

  it("keys contain no client data", () => {
    const limit = globalAuthLimitFor("POST", "/api/auth/two-factor/verify-totp");
    expect(limit).toEqual({ key: "auth-global:/two-factor/verify-totp", rule: { max: 30, windowSeconds: 900 } });
  });
});
