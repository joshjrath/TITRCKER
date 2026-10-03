import { describe, expect, it } from "vitest";

import { privacyFromCookie } from "./privacy";

describe("privacyFromCookie", () => {
  it("hides amounts only for an explicit on", () => {
    expect(privacyFromCookie("on")).toBe("on");
    for (const value of [undefined, "", "off", "ON", "1", "true"]) expect(privacyFromCookie(value)).toBe("off");
  });
});
