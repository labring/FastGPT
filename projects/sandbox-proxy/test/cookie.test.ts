import { describe, it, expect } from 'vitest';
import {
  PROXY_COOKIE,
  parseCookieHeader,
  buildSetCookie,
  getProxyCookieOptions
} from '../src/cookie';

describe('parseCookieHeader', () => {
  it('returns empty map for undefined / empty', () => {
    expect(parseCookieHeader(undefined).size).toBe(0);
    expect(parseCookieHeader('').size).toBe(0);
  });

  it('parses a single cookie', () => {
    const m = parseCookieHeader(`${PROXY_COOKIE}=jwt-here`);
    expect(m.get(PROXY_COOKIE)).toBe('jwt-here');
  });

  it('parses multiple cookies', () => {
    const m = parseCookieHeader(`a=1; ${PROXY_COOKIE}=jwt; b=2`);
    expect(m.get('a')).toBe('1');
    expect(m.get(PROXY_COOKIE)).toBe('jwt');
    expect(m.get('b')).toBe('2');
  });

  it('joins array headers (some servers expose Cookie as string[])', () => {
    const m = parseCookieHeader(['a=1', `${PROXY_COOKIE}=jwt`]);
    expect(m.get(PROXY_COOKIE)).toBe('jwt');
  });

  it('skips malformed entries without =', () => {
    const m = parseCookieHeader(`malformed; a=1`);
    expect(m.size).toBe(1);
    expect(m.get('a')).toBe('1');
  });
});

describe('buildSetCookie', () => {
  it('contains the required attributes', () => {
    const c = buildSetCookie('jwt-value', 3600);
    expect(c).toContain(`${PROXY_COOKIE}=jwt-value`);
    expect(c).toContain('Path=/');
    expect(c).toContain('HttpOnly');
    expect(c).toContain('SameSite=None');
    expect(c).toContain('Secure');
    expect(c).toContain('Max-Age=3600');
  });

  it('does not set Domain (host-only by design)', () => {
    expect(buildSetCookie('jwt', 3600)).not.toContain('Domain=');
  });

  it('uses a non-secure Lax cookie for local HTTP bootstrap', () => {
    const c = buildSetCookie('jwt', 3600, { secure: false });
    expect(c).toContain('SameSite=Lax');
    expect(c).not.toContain('Secure');
  });

  it('uses a partitioned third-party cookie for cross-site iframe bootstrap', () => {
    const c = buildSetCookie('jwt', 3600, { secure: true, partitioned: true });
    expect(c).toContain('SameSite=None');
    expect(c).toContain('Secure');
    expect(c).toContain('Partitioned');
  });
});

describe('getProxyCookieOptions', () => {
  const req = (headers: Record<string, string>) =>
    ({
      headers,
      socket: {}
    }) as any;

  it('disables Secure for local direct HTTP requests', () => {
    expect(getProxyCookieOptions(req({ host: 'abc.localhost:3006' }))).toEqual({
      secure: false
    });
    expect(getProxyCookieOptions(req({ host: 'localhost:3006' }))).toEqual({
      secure: false
    });
  });

  it('uses a partitioned secure cookie for cross-site iframe requests', () => {
    expect(
      getProxyCookieOptions(
        req({
          host: 'abc.localhost:3006',
          'sec-fetch-site': 'cross-site'
        })
      )
    ).toEqual({
      secure: true,
      partitioned: true
    });
  });

  it('uses Secure when forwarded proto is https', () => {
    expect(
      getProxyCookieOptions(
        req({
          host: 'abc.localhost:3006',
          'x-forwarded-proto': 'https'
        })
      )
    ).toEqual({
      secure: true
    });
  });

  it('does not use Secure for direct HTTP requests without forwarded proto', () => {
    expect(getProxyCookieOptions(req({ host: 'abc.sandbox.example.com' }))).toEqual({
      secure: false
    });
  });
});
