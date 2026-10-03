/**
 * Privacy mode: the eye toggle hides every amount on screen (digits show as dots) until it is turned off.
 * The choice lives on <html data-privacy="on|off"> and in a cookie, so the server renders the right state on the
 * next page load with no flash of real numbers. Not sensitive; it holds only "on" or "off".
 *
 * Anything that shows money on a page carries `data-sensitive` (Amount and AnimatedAmount do it themselves; text
 * lines with formatMoney need it on their element). globals.css then draws its digits as dots. Dialogs, toasts and
 * form fields keep real numbers, since the owner opened them to read or type an amount.
 */
export const PRIVACY_COOKIE = "tenth-privacy";

/** The attribute value for a cookie value. Anything but "on" means amounts are shown. */
export function privacyFromCookie(value: string | undefined): "on" | "off" {
  return value === "on" ? "on" : "off";
}

export function isPrivacyOn(): boolean {
  return document.documentElement.dataset.privacy === "on";
}

export function setPrivacy(on: boolean): void {
  const value = on ? "on" : "off";
  document.documentElement.dataset.privacy = value;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${PRIVACY_COOKIE}=${value}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
}
