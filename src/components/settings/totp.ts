/**
 * Pure helpers for the two-factor setup screens: reading the manual-entry key out of an otpauth:// URI and
 * building the backup-codes text file. No secrets are stored or logged; everything stays in the browser.
 */

export interface TotpUriParts {
  /** Base32 secret for manual entry, upper-cased; null when the URI has none. */
  secret: string | null;
  issuer: string | null;
  /** Account label after the issuer prefix, e.g. the owner's email. */
  account: string | null;
}

const TOTP_PREFIX = "otpauth://totp/";

function decode(part: string): string | null {
  try {
    return decodeURIComponent(part);
  } catch {
    return null;
  }
}

/** Parses `otpauth://totp/Issuer:account?secret=ABC&issuer=Issuer` without relying on URL support for custom schemes. */
export function parseTotpUri(uri: string): TotpUriParts {
  if (!uri.toLowerCase().startsWith(TOTP_PREFIX)) return { secret: null, issuer: null, account: null };
  const rest = uri.slice(TOTP_PREFIX.length);
  const queryAt = rest.indexOf("?");
  const label = decode(queryAt === -1 ? rest : rest.slice(0, queryAt)) ?? "";
  const params = new URLSearchParams(queryAt === -1 ? "" : rest.slice(queryAt + 1));
  const rawSecret = params.get("secret")?.replace(/[\s=]/g, "").toUpperCase() ?? "";
  const colon = label.indexOf(":");
  const labelIssuer = colon === -1 ? null : label.slice(0, colon).trim() || null;
  const account = (colon === -1 ? label : label.slice(colon + 1)).trim() || null;
  return {
    secret: /^[A-Z2-7]+$/.test(rawSecret) ? rawSecret : null,
    issuer: params.get("issuer")?.trim() || labelIssuer,
    account,
  };
}

/** "JBSWY3DPEHPK3PXP" -> "JBSW Y3DP EHPK 3PXP" (groups of four, easier to type). */
export function groupSecret(secret: string): string {
  return secret.match(/.{1,4}/g)?.join(" ") ?? "";
}

/** Contents of the downloadable backup-codes file (plain text, one code per line). */
export function backupCodesText(input: { codes: readonly string[]; account: string; createdOn: string }): string {
  return [
    "Tenth: two-factor backup codes",
    `Account: ${input.account}`,
    `Created: ${input.createdOn}`,
    "",
    "Each code works once. Use one when you can't get a code from your authenticator app.",
    "Keep this file somewhere safe, like a password manager. Anyone with these codes and your password can sign in.",
    "",
    ...input.codes,
    "",
  ].join("\n");
}

/** `tenth-backup-codes-YYYY-MM-DD.txt` */
export function backupCodesFileName(createdOn: string): string {
  return `tenth-backup-codes-${createdOn}.txt`;
}
