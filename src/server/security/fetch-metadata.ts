/**
 * Fetch Metadata check for endpoints that must only answer requests the owner started themselves.
 *
 * Browsers send `Sec-Fetch-Site` on every request: `same-origin` (a link or fetch from Tenth itself), `none` (typed
 * into the address bar, a bookmark, a download manager), or `same-site` / `cross-site` (initiated by another site,
 * e.g. an <img>, <script> or link on a foreign page). Downloads of financial data are refused for the last two, so a
 * foreign page can never trigger an export with the owner's cookies. A missing header (old browsers, curl) is allowed:
 * the session cookie is still required, and non-browser clients cannot attach it cross-site.
 *
 * Pure and dependency-free so it is unit-testable.
 */

export const SEC_FETCH_SITE_HEADER = "sec-fetch-site";

const FOREIGN_SITES: ReadonlySet<string> = new Set(["cross-site", "same-site"]);

/** True unless the browser reports that another site (or a sibling subdomain) initiated the request. */
export function isUserInitiatedRequest(headers: Headers): boolean {
  const site = headers.get(SEC_FETCH_SITE_HEADER)?.trim().toLowerCase();
  return site === undefined || !FOREIGN_SITES.has(site);
}
