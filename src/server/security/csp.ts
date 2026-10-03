/**
 * Content-Security-Policy builder used by src/proxy.ts (pure, no server-only import: the proxy bundle
 * does not resolve the react-server condition).
 *
 * Decisions:
 * - script-src: per-request nonce + 'strict-dynamic'. Next.js reads the nonce from the *request* CSP header and
 *   stamps it on every framework/page script; 'strict-dynamic' lets those scripts load their chunks. 'self' is a
 *   fallback for CSP2-only browsers (ignored when 'strict-dynamic' is understood). 'unsafe-eval' only in
 *   development, where React rebuilds server error stacks with eval.
 * - style-src-elem: 'self' + nonce. Production CSS ships as <link rel="stylesheet" nonce> from /_next/static.
 *   Development injects <style> tags for HMR, so it uses 'unsafe-inline' instead (a nonce would disable it).
 * - style-src-attr 'unsafe-inline': React renders `style={{...}}` props as inline style attributes (e.g. chart
 *   geometry, progress widths) and nonces can never apply to attributes. Inline style attributes cannot run
 *   script; the residual risk (CSS-based UI redressing) needs an HTML injection first, which React's escaping
 *   prevents. Scripts stay strictly nonce-gated.
 * - style-src mirrors style-src-elem for browsers without the -elem/-attr split (they then block attributes,
 *   which only affects presentation).
 * - No third-party origins anywhere: fonts are self-hosted, there are no analytics.
 */

export interface CspOptions {
  nonce: string;
  /** NODE_ENV === "development" */
  isDev: boolean;
  /** Adds upgrade-insecure-requests (production only). */
  upgradeInsecureRequests: boolean;
}

/** 128 bits from the Web Crypto RNG, base64-encoded (valid CSP nonce-source characters). */
export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function buildCsp({ nonce, isDev, upgradeInsecureRequests }: CspOptions): string {
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(nonce)) {
    throw new Error("Invalid CSP nonce");
  }
  const nonceSource = `'nonce-${nonce}'`;
  const styleElem = isDev ? "'self' 'unsafe-inline'" : `'self' ${nonceSource}`;
  const directives: string[] = [
    "default-src 'self'",
    `script-src 'self' ${nonceSource} 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src ${styleElem}`,
    `style-src-elem ${styleElem}`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "manifest-src 'self'",
    "worker-src 'self' blob:",
  ];
  if (upgradeInsecureRequests) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}
