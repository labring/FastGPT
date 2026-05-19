import { parse, serialize } from 'cookie';
import type { IncomingMessage } from 'http';

export const PROXY_COOKIE = 'sandbox_token';

// Parse a Cookie header into a name → value map.
export function parseCookieHeader(header: string | string[] | undefined): Map<string, string> {
  const raw = Array.isArray(header) ? header.join('; ') : (header ?? '');
  const parsed = parse(raw);
  return new Map(Object.entries(parsed));
}

const getFirstHeaderValue = (value: string | string[] | undefined) => {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.split(',')[0]?.trim().toLowerCase() ?? '';
};

export type ProxyCookieOptions = {
  secure: boolean;
  partitioned?: boolean;
};

const isCrossSiteRequest = (req: IncomingMessage) =>
  getFirstHeaderValue(req.headers['sec-fetch-site']) === 'cross-site';

const shouldUseSecureCookie = (req: IncomingMessage): boolean => {
  const forwardedProto = getFirstHeaderValue(req.headers['x-forwarded-proto']);
  if (forwardedProto) return forwardedProto === 'https';

  return !!(req.socket as { encrypted?: boolean } | undefined)?.encrypted;
};

/**
 * Cookie shape depends on how the sandbox is embedded.
 *
 * - Cross-site iframe: Chrome blocks normal third-party cookies, so use CHIPS
 *   (`Partitioned`) with `SameSite=None; Secure`.
 * - Local direct HTTP: browsers reject Secure cookies, so fall back to Lax.
 * - HTTPS / production: keep the original third-party-compatible cookie.
 */
export function getProxyCookieOptions(req: IncomingMessage): ProxyCookieOptions {
  if (isCrossSiteRequest(req)) {
    return {
      secure: true,
      partitioned: true
    };
  }

  return {
    secure: shouldUseSecureCookie(req)
  };
}

// Build Set-Cookie header string for the proxy session cookie.
// Path=/ scope, host-only (no Domain attribute) so it doesn't leak across subdomains.
export function buildSetCookie(
  jwt: string,
  maxAgeSeconds: number,
  { secure = true, partitioned }: ProxyCookieOptions = { secure: true }
): string {
  return serialize(PROXY_COOKIE, jwt, {
    path: '/',
    httpOnly: true,
    sameSite: secure ? 'none' : 'lax',
    secure,
    partitioned,
    maxAge: maxAgeSeconds
  });
}
