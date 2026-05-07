import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deriveCsLoginTarget,
  ensureCsSession,
  evictCsSession,
  injectCsKey
} from '../src/csSession';

describe('deriveCsLoginTarget', () => {
  it('keeps base target for non-proxy paths', () => {
    expect(deriveCsLoginTarget('http://upstream:1234', '/')).toBe('http://upstream:1234');
    expect(deriveCsLoginTarget('http://upstream:1234', '/foo/bar')).toBe('http://upstream:1234');
  });

  it('maps /proxy/{port}/... paths to the same inner proxy base', () => {
    expect(deriveCsLoginTarget('http://upstream:1234', '/proxy/8080/')).toBe(
      'http://upstream:1234/proxy/8080'
    );
    expect(deriveCsLoginTarget('http://upstream:1234', '/proxy/8080/workbench?x=1')).toBe(
      'http://upstream:1234/proxy/8080'
    );
  });
});

describe('injectCsKey', () => {
  it('writes the cookie when none exists', () => {
    const headers: Record<string, unknown> = {};
    injectCsKey(headers, { name: 'key', value: 'abc' });
    expect(headers.cookie).toBe('key=abc');
  });

  it('preserves unrelated cookies and appends the cs cookie', () => {
    const headers: Record<string, unknown> = { cookie: 'theme=dark; lang=en' };
    injectCsKey(headers, { name: 'key', value: 'xyz' });
    expect(headers.cookie).toBe('theme=dark; lang=en; key=xyz');
  });

  it('replaces every known cs cookie variant in one pass', () => {
    const headers: Record<string, unknown> = {
      cookie: 'code-server-session=stale1; coder-session=stale2; key=stale3; theme=dark'
    };
    injectCsKey(headers, { name: 'key', value: 'fresh' });
    expect(headers.cookie).toBe('theme=dark; key=fresh');
  });

  it('matches cs cookie names case-insensitively when stripping', () => {
    const headers: Record<string, unknown> = { cookie: 'KEY=stale; foo=bar' };
    injectCsKey(headers, { name: 'key', value: 'fresh' });
    expect(headers.cookie).toBe('foo=bar; key=fresh');
  });

  it('drops empty segments produced by trailing semicolons', () => {
    const headers: Record<string, unknown> = { cookie: 'foo=bar;; ; ' };
    injectCsKey(headers, { name: 'key', value: 'v' });
    expect(headers.cookie).toBe('foo=bar; key=v');
  });
});

describe('ensureCsSession', () => {
  const APP_BASE = 'http://localhost:3000';
  const TARGET = 'http://upstream:55549';
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Build a response that mimics the part of `Response` ensureCsSession relies on.
  // `getSetCookie` is what newer Node fetch exposes; we provide it directly.
  const mkResponse = (status: number, setCookies: string[] = []): Response =>
    ({
      status,
      ok: status >= 200 && status < 300,
      headers: {
        getSetCookie: () => setCookies,
        get: (name: string) => (name.toLowerCase() === 'set-cookie' ? setCookies[0] ?? null : null)
      },
      json: async () => ({})
    }) as unknown as Response;

  const mkPasswordResponse = (password: string | null): Response =>
    ({
      status: 200,
      ok: true,
      headers: { get: () => null, getSetCookie: () => [] },
      json: async () => ({ password })
    }) as unknown as Response;

  it('returns and caches a session on a successful 302 + Set-Cookie login', async () => {
    const sid = 'sid-success';
    fetchMock
      .mockResolvedValueOnce(mkPasswordResponse('hunter2'))
      .mockResolvedValueOnce(mkResponse(302, ['key=abc; Path=/; HttpOnly']));

    const session = await ensureCsSession(sid, TARGET);
    expect(session).toEqual({ name: 'key', value: 'abc' });

    const [pwReq, loginReq] = fetchMock.mock.calls;
    expect(pwReq[0]).toBe(`${APP_BASE}/api/core/sandbox/internal/csPassword`);
    expect(loginReq[0]).toBe(`${TARGET}/login`);
    expect(loginReq[1]).toMatchObject({ method: 'POST', redirect: 'manual' });

    // Second call should hit the cache and not call fetch again.
    fetchMock.mockClear();
    const cached = await ensureCsSession(sid, TARGET);
    expect(cached).toEqual({ name: 'key', value: 'abc' });
    expect(fetchMock).not.toHaveBeenCalled();

    evictCsSession(sid);
  });

  it('extracts code-server-session and coder-session variants', async () => {
    const sid1 = 'sid-variant-a';
    fetchMock
      .mockResolvedValueOnce(mkPasswordResponse('p'))
      .mockResolvedValueOnce(mkResponse(302, ['code-server-session=A1; Path=/']));
    expect(await ensureCsSession(sid1, TARGET)).toEqual({
      name: 'code-server-session',
      value: 'A1'
    });
    evictCsSession(sid1);

    const sid2 = 'sid-variant-b';
    fetchMock
      .mockResolvedValueOnce(mkPasswordResponse('p'))
      .mockResolvedValueOnce(mkResponse(302, ['coder-session=B2; Path=/']));
    expect(await ensureCsSession(sid2, TARGET)).toEqual({ name: 'coder-session', value: 'B2' });
    evictCsSession(sid2);
  });

  it('returns null and records backoff when password fetch returns no password', async () => {
    const sid = 'sid-no-password';
    fetchMock.mockResolvedValueOnce(mkPasswordResponse(null));

    expect(await ensureCsSession(sid, TARGET)).toBeNull();

    // The next call within the backoff window must short-circuit (no fetches at all).
    fetchMock.mockClear();
    expect(await ensureCsSession(sid, TARGET)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();

    evictCsSession(sid); // also clears backoff entry
  });

  it('returns null when login responds with non-redirect status', async () => {
    const sid = 'sid-login-200';
    fetchMock
      .mockResolvedValueOnce(mkPasswordResponse('p'))
      .mockResolvedValueOnce(mkResponse(200, ['key=should-not-be-used']));
    expect(await ensureCsSession(sid, TARGET)).toBeNull();
    evictCsSession(sid);
  });

  it('returns null and records backoff when 302 carries no recognised cs cookie', async () => {
    const sid = 'sid-no-cookie';
    fetchMock
      .mockResolvedValueOnce(mkPasswordResponse('p'))
      .mockResolvedValueOnce(mkResponse(302, ['unrelated=foo; Path=/']));
    expect(await ensureCsSession(sid, TARGET)).toBeNull();

    // Backoff should now suppress the next call.
    fetchMock.mockClear();
    expect(await ensureCsSession(sid, TARGET)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();

    evictCsSession(sid);
  });

  it('returns null when the login request itself throws', async () => {
    const sid = 'sid-login-throws';
    fetchMock
      .mockResolvedValueOnce(mkPasswordResponse('p'))
      .mockRejectedValueOnce(new Error('econnreset'));
    expect(await ensureCsSession(sid, TARGET)).toBeNull();
    evictCsSession(sid);
  });

  it('evictCsSession also clears the backoff entry, allowing immediate retry', async () => {
    const sid = 'sid-evict-clears-backoff';
    fetchMock.mockResolvedValueOnce(mkPasswordResponse(null));
    expect(await ensureCsSession(sid, TARGET)).toBeNull();

    evictCsSession(sid);

    // After evict, the next call must reach fetch again (backoff cleared).
    fetchMock.mockClear();
    fetchMock
      .mockResolvedValueOnce(mkPasswordResponse('p'))
      .mockResolvedValueOnce(mkResponse(302, ['key=ok']));
    expect(await ensureCsSession(sid, TARGET)).toEqual({ name: 'key', value: 'ok' });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    evictCsSession(sid);
  });
});
