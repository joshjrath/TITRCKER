import { describe, expect, it } from "vitest";

import { PINNED_VERSE, pickVerse, ROTATING_VERSES, verseParts } from "./verses";

describe("verse list", () => {
  it("pins Romans 8:18 and keeps it out of the rotation", () => {
    expect(PINNED_VERSE.reference).toBe("Romans 8:18");
    expect(PINNED_VERSE.text).toBe("Yet what we suffer now is nothing compared to the glory he will reveal to us later.");
    expect(ROTATING_VERSES.map((v) => v.id)).not.toContain(PINNED_VERSE.id);
  });

  it("has unique ids and references, and well-formed text", () => {
    const ids = ROTATING_VERSES.map((v) => v.id);
    const references = ROTATING_VERSES.map((v) => v.reference);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(references).size).toBe(references.length);
    for (const verse of [PINNED_VERSE, ...ROTATING_VERSES]) {
      expect(verse.id).toMatch(/^[a-z0-9]+(-\d+)+$/);
      expect(verse.text).toBe(verse.text.trim());
      expect(verse.text).not.toMatch(/\s{2,}|["']/); // curly quotes only, no double spaces
      expect(verse.text).toMatch(/[.!?”]$/);
      // Opening and closing quotation marks pair up.
      expect(verse.text.split("“").length).toBe(verse.text.split("”").length);
    }
  });

  it("keeps enough verses that a refresh always has others to show", () => {
    expect(ROTATING_VERSES.length).toBeGreaterThanOrEqual(30);
  });
});

describe("pickVerse", () => {
  it("never repeats the verse shown last", () => {
    for (const last of ROTATING_VERSES) {
      for (const r of [0, 0.25, 0.5, 0.999999]) {
        expect(pickVerse(last.id, () => r).id).not.toBe(last.id);
      }
    }
  });

  it("can pick every verse, and ignores a missing or unknown cookie", () => {
    const seen = new Set<string>();
    const n = ROTATING_VERSES.length;
    for (let i = 0; i < n; i += 1) seen.add(pickVerse(undefined, () => i / n).id);
    expect(seen.size).toBe(n);
    expect(ROTATING_VERSES.map((v) => v.id)).toContain(pickVerse("not-a-verse", () => 0.5).id);
  });

  it("stays in range for edge random values", () => {
    expect(pickVerse(undefined, () => 0)).toBe(ROTATING_VERSES[0]);
    expect(pickVerse(undefined, () => 1)).toBe(ROTATING_VERSES[ROTATING_VERSES.length - 1]);
    expect(pickVerse(undefined, () => -1)).toBe(ROTATING_VERSES[0]);
  });
});

describe("verseParts", () => {
  it("marks LORD for small caps and leaves Lord and other text alone", () => {
    expect(verseParts("The LORD is my shepherd; I have all that I need.")).toEqual([
      { text: "The ", divineName: false },
      { text: "LORD", divineName: true },
      { text: " is my shepherd; I have all that I need.", divineName: false },
    ]);
    expect(verseParts("But the Lord is faithful.")).toEqual([{ text: "But the Lord is faithful.", divineName: false }]);
    expect(verseParts("LORDS")).toEqual([{ text: "LORDS", divineName: false }]);
  });

  it("rebuilds the original text", () => {
    for (const verse of ROTATING_VERSES) {
      expect(verseParts(verse.text).map((p) => p.text).join("")).toBe(verse.text);
    }
  });
});
