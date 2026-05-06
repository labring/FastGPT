import type { IncomingMessage } from 'http';
import jwt from 'jsonwebtoken';
import { parseSandboxHost } from './host';
import { PROXY_COOKIE, parseCookieHeader } from './cookie';
import { env } from './env';
import type { ProxyTokenPayload } from '@fastgpt/global/core/ai/sandbox/proxyToken';

export type VerifiedProxyTokenPayload = ProxyTokenPayload & {
  exp: number;
};

export const verifyProxyToken = (token: string): VerifiedProxyTokenPayload | null => {
  try {
    const decoded = jwt.verify(token, env.secret) as Record<string, unknown>;
    if (
      typeof decoded.sid !== 'string' ||
      typeof decoded.p !== 'number' ||
      typeof decoded.t !== 'string' ||
      typeof decoded.exp !== 'number'
    ) {
      return null;
    }
    return { sid: decoded.sid, p: decoded.p, t: decoded.t, exp: decoded.exp };
  } catch {
    return null;
  }
};

export type AuthOk = {
  token: VerifiedProxyTokenPayload;
  /** Verified JWT string, reused as cookie value during bootstrap. */
  jwt: string;
  /** Remaining token lifetime in seconds for cookie Max-Age. */
  cookieMaxAgeSeconds: number;
  /** True when token came from `?_t=` query bootstrap. */
  freshFromQuery: boolean;
  /** Forward URL with `_t` removed. */
  cleanedUrl: string;
};

export type AuthErr = { error: string; status: number };

/**
 * Strip the `_t` query param from a request URL string. Returns a new URL string with
 * `_t` removed; preserves all other query params and the path.
 */
export function stripBootstrapToken(rawUrl: string): string {
  const idx = rawUrl.indexOf('?');
  if (idx < 0) return rawUrl;
  const path = rawUrl.slice(0, idx);
  const queryAndHash = rawUrl.slice(idx + 1);
  const hashIdx = queryAndHash.indexOf('#');
  const query = hashIdx >= 0 ? queryAndHash.slice(0, hashIdx) : queryAndHash;
  const hash = hashIdx >= 0 ? queryAndHash.slice(hashIdx) : '';

  const kept = query
    .split('&')
    .filter((p) => p && !p.startsWith('_t=') && p !== '_t')
    .join('&');

  if (!kept) return path + hash;
  return `${path}?${kept}${hash}`;
}

/**
 * Authenticate a request: cookie first, then `?_t=` query bootstrap.
 * The JWT's `sid` must match the subdomain on the request host.
 */
export function authenticate(req: Pick<IncomingMessage, 'headers' | 'url'>): AuthOk | AuthErr {
  const sub = parseSandboxHost(req.headers.host);
  if (!sub) return { error: 'Unknown host', status: 404 };

  const urlObj = new URL(req.url || '/', `http://${req.headers.host}`);
  const queryToken = urlObj.searchParams.get('_t');

  const cookies = parseCookieHeader(req.headers.cookie);
  const cookieToken = cookies.get(PROXY_COOKIE);

  // Always strip `_t` from the forwarded URL — even on the cookie auth path, where
  // a stale query param might still be present from a bookmark or back-button.
  const cleaned = stripBootstrapToken(req.url || '/');

  const tryToken = (raw: string | null | undefined, fresh: boolean): AuthOk | null => {
    if (!raw) return null;
    const decoded = verifyProxyToken(raw);
    if (!decoded) return null;
    if (decoded.sid !== sub.sandboxId) return null;
    const cookieMaxAgeSeconds = Math.max(decoded.exp - Math.floor(Date.now() / 1000), 1);
    return {
      token: decoded,
      jwt: raw,
      cookieMaxAgeSeconds,
      freshFromQuery: fresh,
      cleanedUrl: cleaned
    };
  };

  return (
    tryToken(queryToken, true) ??
    tryToken(cookieToken, false) ?? { error: 'Unauthorized', status: 401 }
  );
}
