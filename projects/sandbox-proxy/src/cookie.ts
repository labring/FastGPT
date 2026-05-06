import { parse, serialize } from 'cookie';

export const PROXY_COOKIE = 'sandbox_token';

// Parse a Cookie header into a name → value map.
export function parseCookieHeader(header: string | string[] | undefined): Map<string, string> {
  const raw = Array.isArray(header) ? header.join('; ') : header ?? '';
  const parsed = parse(raw);
  return new Map(Object.entries(parsed));
}

// Build Set-Cookie header string for the proxy session cookie.
// Path=/ scope, host-only (no Domain attribute) so it doesn't leak across subdomains.
export function buildSetCookie(jwt: string, maxAgeSeconds: number): string {
  return serialize(PROXY_COOKIE, jwt, {
    path: '/',
    httpOnly: true,
    sameSite: 'none',
    secure: true,
    maxAge: maxAgeSeconds
  });
}
