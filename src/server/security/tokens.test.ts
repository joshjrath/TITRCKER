import { describe, expect, it } from "vitest";

import { constantTimeEqual } from "./tokens";

describe("constantTimeEqual", () => {
  it("accepts identical strings", () => {
    expect(constantTimeEqual("s3cret-setup-token", "s3cret-setup-token")).toBe(true);
  });

  it("rejects different strings of equal and unequal length", () => {
    expect(constantTimeEqual("s3cret-setup-tokeN", "s3cret-setup-token")).toBe(false);
    expect(constantTimeEqual("s3cret", "s3cret-setup-token")).toBe(false);
    expect(constantTimeEqual("s3cret-setup-token-and-more", "s3cret-setup-token")).toBe(false);
  });

  it("never matches an empty expected value", () => {
    expect(constantTimeEqual("", "")).toBe(false);
    expect(constantTimeEqual("anything", "")).toBe(false);
  });

  it("compares unicode exactly (no normalisation)", () => {
    expect(constantTimeEqual("café", "café")).toBe(false);
    expect(constantTimeEqual("café", "café")).toBe(true);
  });
});
