import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deriveCsLoginTarget,
  ensureCsSession,
  evictCsSession,
  injectCsKey,
  isProxyMappedRequestUrl,
  rewriteProxyRequestUrl
} from '../src/csSession';

describe('deriveCsLoginTarget', () => {
  it('keeps base target for non-proxy paths', () => {
    const mapping = { publicPath: '/__fastgpt_proxy/code-server/', basePath: '/proxy/8080' };
    expect(deriveCsLoginTarget('http://upstream:1234', '/', mapping)).toBe('http://upstream:1234');
    expect(deriveCsLoginTarget('http://upstream:1234', '/foo/bar', mapping)).toBe(
      'http://upstream:1234'
    );
  });

  it('maps the public code-server path to the provider base path', () => {
    const mapping = { publicPath: '/__fastgpt_proxy/code-server/', basePath: '/proxy/8080' };
    expect(
      deriveCsLoginTarget('http://upstream:1234', '/__fastgpt_proxy/code-server/', mapping)
    ).toBe('http://upstream:1234/proxy/8080');
    expect(
      deriveCsLoginTarget(
        'http://upstream:1234',
        '/__fastgpt_proxy/code-server/workbench?x=1',
        mapping
      )
    ).toBe('http://upstream:1234/proxy/8080');
  });

  it('also treats provider base path requests as code-server traffic', () => {
    const mapping = { publicPath: '/__fastgpt_proxy/code-server/', basePath: '/proxy/8080' };
    expect(deriveCsLoginTarget('http://upstream:1234', '/proxy/8080/workbench?x=1', mapping)).toBe(
      'http://upstream:1234/proxy/8080'
    );
  });

  it('uses root base path for providers that expose code-server at origin root', () => {
    expect(
      deriveCsLoginTarget(
        'https://devbox-abc-1318.example.com',
        '/__fastgpt_proxy/code-server/workbench',
        {
          publicPath: '/__fastgpt_proxy/code-server/',
          basePath: ''
        }
      )
    ).toBe('https://devbox-abc-1318.example.com');
    expect(
      deriveCsLoginTarget('https://devbox-abc-1318.example.com', '/stable/hash/main.js', {
        publicPath: '/__fastgpt_proxy/code-server/',
        basePath: ''
      })
    ).toBe('https://devbox-abc-1318.example.com');
  });
});

describe('rewriteProxyRequestUrl', () => {
  it('maps public code-server path to the OpenSandbox provider base path', () => {
    const mapping = { publicPath: '/__fastgpt_proxy/code-server/', basePath: '/proxy/8080' };
    expect(
      rewriteProxyRequestUrl('/__fastgpt_proxy/code-server/?folder=/home/sandbox', mapping)
    ).toBe('/proxy/8080/?folder=/home/sandbox');
    expect(rewriteProxyRequestUrl('/__fastgpt_proxy/code-server/workbench?x=1', mapping)).toBe(
      '/proxy/8080/workbench?x=1'
    );
  });

  it('keeps provider base path requests unchanged', () => {
    const mapping = { publicPath: '/__fastgpt_proxy/code-server/', basePath: '/proxy/8080' };
    expect(rewriteProxyRequestUrl('/proxy/8080/workbench?x=1', mapping)).toBe(
      '/proxy/8080/workbench?x=1'
    );
  });

  it('strips public path when upstream code-server is served at root', () => {
    expect(
      rewriteProxyRequestUrl('/__fastgpt_proxy/code-server/?folder=/home/devbox/workspace', {
        publicPath: '/__fastgpt_proxy/code-server/',
        basePath: ''
      })
    ).toBe('/?folder=/home/devbox/workspace');
    expect(
      rewriteProxyRequestUrl('/__fastgpt_proxy/code-server/workbench?x=1', {
        publicPath: '/__fastgpt_proxy/code-server/',
        basePath: ''
      })
    ).toBe('/workbench?x=1');
  });
});

describe('isProxyMappedRequestUrl', () => {
  it('only treats public path and provider base path as mapped for nested providers', () => {
    const mapping = { publicPath: '/__fastgpt_proxy/code-server/', basePath: '/proxy/8080' };

    expect(isProxyMappedRequestUrl('/__fastgpt_proxy/code-server/workbench', mapping)).toBe(true);
    expect(isProxyMappedRequestUrl('/proxy/8080/stable/hash/main.js', mapping)).toBe(true);
    expect(isProxyMappedRequestUrl('/favicon.ico', mapping)).toBe(false);
  });

  it('treats root-mounted providers as mapped after proxy auth is handled', () => {
    const mapping = { publicPath: '/__fastgpt_proxy/code-server/', basePath: '' };

    expect(isProxyMappedRequestUrl('/__fastgpt_proxy/code-server/workbench', mapping)).toBe(true);
    expect(isProxyMappedRequestUrl('/stable/hash/main.js', mapping)).toBe(true);
    expect(isProxyMappedRequestUrl('/favicon.ico', mapping)).toBe(true);
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
        get: (name: string) =>
          name.toLowerCase() === 'set-cookie' ? (setCookies[0] ?? null) : null
      },
      json: async () => ({})
    }) as unknown as Response;

  it('returns and caches a session on a successful 302 + Set-Cookie login', async () => {
    const sid = 'sid-success';
    fetchMock.mockResolvedValueOnce(mkResponse(302, ['key=abc; Path=/; HttpOnly']));

    const session = await ensureCsSession(sid, TARGET, 'hunter2');
    expect(session).toEqual({ name: 'key', value: 'abc' });

    const [loginReq] = fetchMock.mock.calls;
    expect(loginReq[0]).toBe(`${TARGET}/login`);
    expect(loginReq[1]).toMatchObject({ method: 'POST', redirect: 'manual' });

    // Second call should hit the cache and not call fetch again.
    fetchMock.mockClear();
    const cached = await ensureCsSession(sid, TARGET);
    expect(cached).toEqual({ name: 'key', value: 'abc' });
    expect(fetchMock).not.toHaveBeenCalled();

    evictCsSession(sid);
  });

  it('uses proxy target password directly', async () => {
    const sid = 'sid-target-password';
    fetchMock.mockResolvedValueOnce(mkResponse(302, ['key=direct; Path=/; HttpOnly']));

    const session = await ensureCsSession(sid, TARGET, 'from-target');
    expect(session).toEqual({ name: 'key', value: 'direct' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(`${TARGET}/login`);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      body: 'password=from-target',
      method: 'POST'
    });

    evictCsSession(sid);
  });

  it('returns null and records backoff when target has no password', async () => {
    const sid = 'sid-no-password';

    expect(await ensureCsSession(sid, TARGET)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();

    // The next call within the backoff window must short-circuit.
    expect(await ensureCsSession(sid, TARGET)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();

    evictCsSession(sid); // also clears backoff entry
  });

  it('extracts code-server-session and coder-session variants', async () => {
    const sid1 = 'sid-variant-a';
    fetchMock.mockResolvedValueOnce(mkResponse(302, ['code-server-session=A1; Path=/']));
    expect(await ensureCsSession(sid1, TARGET, 'p')).toEqual({
      name: 'code-server-session',
      value: 'A1'
    });
    evictCsSession(sid1);

    const sid2 = 'sid-variant-b';
    fetchMock.mockResolvedValueOnce(mkResponse(302, ['coder-session=B2; Path=/']));
    expect(await ensureCsSession(sid2, TARGET, 'p')).toEqual({
      name: 'coder-session',
      value: 'B2'
    });
    evictCsSession(sid2);
  });

  it('returns null when login responds with non-redirect status', async () => {
    const sid = 'sid-login-200';
    fetchMock.mockResolvedValueOnce(mkResponse(200, ['key=should-not-be-used']));
    expect(await ensureCsSession(sid, TARGET, 'p')).toBeNull();
    evictCsSession(sid);
  });

  it('returns null and records backoff when 302 carries no recognised cs cookie', async () => {
    const sid = 'sid-no-cookie';
    fetchMock.mockResolvedValueOnce(mkResponse(302, ['unrelated=foo; Path=/']));
    expect(await ensureCsSession(sid, TARGET, 'p')).toBeNull();

    // Backoff should now suppress the next call.
    fetchMock.mockClear();
    expect(await ensureCsSession(sid, TARGET, 'p')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();

    evictCsSession(sid);
  });

  it('returns null when the login request itself throws', async () => {
    const sid = 'sid-login-throws';
    fetchMock.mockRejectedValueOnce(new Error('econnreset'));
    expect(await ensureCsSession(sid, TARGET, 'p')).toBeNull();
    evictCsSession(sid);
  });

  it('evictCsSession also clears the backoff entry, allowing immediate retry', async () => {
    const sid = 'sid-evict-clears-backoff';
    expect(await ensureCsSession(sid, TARGET)).toBeNull();

    evictCsSession(sid);

    // After evict, the next call must reach fetch again (backoff cleared).
    fetchMock.mockClear();
    fetchMock.mockResolvedValueOnce(mkResponse(302, ['key=ok']));
    expect(await ensureCsSession(sid, TARGET, 'p')).toEqual({ name: 'key', value: 'ok' });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    evictCsSession(sid);
  });
});
