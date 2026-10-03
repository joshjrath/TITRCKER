/** Joins class names, skipping falsy values. Tiny on purpose (no external dependency). */
export function cn(...parts: Array<string | false | null | undefined | 0>): string {
  return parts.filter(Boolean).join(" ");
}
