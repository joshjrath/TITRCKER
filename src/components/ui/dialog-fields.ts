/** Matches the CSS "Phones (< 640px)" block in globals.css, where sheets are full-screen forms. */
export const PHONE_QUERY = "(width < 640px)";

/** Gap between the top of the sheet body and a field scrolled up for typing. */
const FIELD_TOP_GAP = 16;

/**
 * A field whose bottom edge sits within this share of the screen height is left where it is. Lower down, the
 * on-screen keyboard plus Safari's floating toolbar may cover it.
 */
const KEYBOARD_SAFE_SHARE = 0.4;

const NON_TEXT_INPUT_TYPES = new Set(["checkbox", "radio", "button", "submit", "reset", "range", "color", "file", "image", "hidden"]);

/** Whether an element with this tag name (and input type) brings up the on-screen keyboard or a picker. */
export function isTextEntryTag(tagName: string, type = ""): boolean {
  const tag = tagName.toUpperCase();
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  return tag === "INPUT" && !NON_TEXT_INPUT_TYPES.has(type.toLowerCase());
}

/** A field that brings up the on-screen keyboard (or a picker in its place). */
export function isTextEntryField(el: EventTarget | null): el is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  if (!(el instanceof HTMLElement)) return false;
  return isTextEntryTag(el.tagName, el instanceof HTMLInputElement ? el.type : "");
}

/**
 * How far to scroll a sheet body so a focused field (its top including the label) lands just under the top of the
 * body, or 0 when the field already sits high enough on the screen for the keyboard not to cover it.
 */
export function fieldRevealOffset(bodyTop: number, fieldTop: number, fieldBottom: number, viewportHeight: number): number {
  if (fieldBottom <= viewportHeight * KEYBOARD_SAFE_SHARE) return 0;
  return Math.max(0, Math.round(fieldTop - bodyTop - FIELD_TOP_GAP));
}

export function mediaMatches(query: string): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(query).matches;
}
