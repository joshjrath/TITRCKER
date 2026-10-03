import { describe, expect, it } from "vitest";

import { canonicalTimeZone, timeZoneField } from "./settings";

describe("timeZoneField", () => {
  it.each([
    ["America/Toronto", "America/Toronto"],
    ["america/toronto", "America/Toronto"],
    [" AMERICA/VANCOUVER ", "America/Vancouver"],
    ["UTC", "UTC"],
    ["utc", "UTC"],
  ])("accepts %j as %j", (input, expected) => {
    expect(timeZoneField.parse(input)).toBe(expected);
  });

  it.each(["EST", "US/Eastern", "Etc/GMT+5", "+05:00", "-0500", "GMT", "Mars/Olympus", ""])("rejects %j", (input) => {
    expect(timeZoneField.safeParse(input).success).toBe(false);
  });

  it("accepts every zone the runtime lists, with its exact spelling", () => {
    for (const zone of Intl.supportedValuesOf("timeZone")) expect(canonicalTimeZone(zone)).toBe(zone);
  });
});
