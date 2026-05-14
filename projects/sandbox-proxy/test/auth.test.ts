import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { authenticate, type AuthOk, stripBootstrapToken, verifyProxyToken } from '../src/auth';
import { PROXY_COOKIE } from '../src/cookie';

const SECRET = 'a'.repeat(32);
const DEFAULT_TTL_SECONDS = 1800;

const sign = (payload: object, opts?: jwt.SignOptions) =>
  jwt.sign(payload, SECRET, { expiresIn: DEFAULT_TTL_SECONDS, ...opts });

const mkReq = (host: string | undefined, url: string, cookie?: string) => ({
  headers: { host, ...(cookie ? { cookie } : {}) },
  url
});

const isOk = (r: ReturnType<typeof authenticate>): r is AuthOk => !('error' in r);

describe('authenticate', () => {
  it('rejects requests with no Host or no sandbox subdomain', () => {
    expect(authenticate(mkReq(undefined, '/'))).toEqual({ error: 'Unknown host', status: 404 });
    expect(authenticate(mkReq('localhost:3006', '/'))).toEqual({
      error: 'Unknown host',
      status: 404
    });
  });

  it('returns 401 when no token is present', () => {
    expect(authenticate(mkReq('abc.localhost:3006', '/foo'))).toEqual({
      error: 'Unauthorized',
      status: 401
    });
    expect(authenticate(mkReq('evil.com', '/foo'))).toEqual({
      error: 'Unauthorized',
      status: 401
    });
  });

  it('accepts bootstrap token via ?_t= and reports freshFromQuery', () => {
    const tk = sign({ sid: 'abc', svc: 'code-server' });
    const r = authenticate(mkReq('abc.localhost:3006', `/path?_t=${tk}`));
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.freshFromQuery).toBe(true);
    expect(r.jwt).toBe(tk);
    expect(r.token.sid).toBe('abc');
    expect(r.cookieMaxAgeSeconds).toBeGreaterThan(0);
    expect(r.cookieMaxAgeSeconds).toBeLessThanOrEqual(DEFAULT_TTL_SECONDS);
    expect(r.cleanedUrl).toBe('/path');
  });

  it('accepts cookie token and reports freshFromQuery=false', () => {
    const tk = sign({ sid: 'abc', svc: 'code-server' });
    const r = authenticate(mkReq('abc.localhost:3006', '/path', `${PROXY_COOKIE}=${tk}`));
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.freshFromQuery).toBe(false);
    expect(r.jwt).toBe(tk);
    expect(r.cleanedUrl).toBe('/path');
  });

  it('prefers query token when both query and cookie are present', () => {
    const qTk = sign({ sid: 'abc', svc: 'code-server' });
    const cTk = sign({ sid: 'abc', svc: 'code-server' });
    const r = authenticate(mkReq('abc.localhost:3006', `/?_t=${qTk}`, `${PROXY_COOKIE}=${cTk}`));
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.freshFromQuery).toBe(true);
    expect(r.jwt).toBe(qTk);
    expect(r.token.svc).toBe('code-server');
  });

  it('falls back to cookie when query token is invalid', () => {
    const cTk = sign({ sid: 'abc', svc: 'code-server' });
    const r = authenticate(mkReq('abc.localhost:3006', '/?_t=garbage', `${PROXY_COOKIE}=${cTk}`));
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.freshFromQuery).toBe(false);
    expect(r.jwt).toBe(cTk);
  });

  it('rejects when JWT sid does not match the subdomain', () => {
    const tk = sign({ sid: 'other', svc: 'code-server' });
    expect(authenticate(mkReq('abc.localhost:3006', `/?_t=${tk}`))).toEqual({
      error: 'Unauthorized',
      status: 401
    });
  });

  it('rejects expired tokens', () => {
    const tk = sign({ sid: 'abc', svc: 'code-server' }, { expiresIn: -1 });
    expect(authenticate(mkReq('abc.localhost:3006', `/?_t=${tk}`))).toEqual({
      error: 'Unauthorized',
      status: 401
    });
  });

  it('rejects tokens signed with a different secret', () => {
    const tk = jwt.sign({ sid: 'abc', svc: 'code-server' }, 'other-secret-12345678', {
      expiresIn: DEFAULT_TTL_SECONDS
    });
    expect(authenticate(mkReq('abc.localhost:3006', `/?_t=${tk}`))).toEqual({
      error: 'Unauthorized',
      status: 401
    });
  });

  it('strips _t from cleanedUrl while preserving other params', () => {
    const tk = sign({ sid: 'abc', svc: 'code-server' });
    const r = authenticate(
      mkReq('abc.localhost:3006', `/__fastgpt_proxy/code-server/?folder=/home/sandbox&_t=${tk}`)
    );
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.cleanedUrl).toBe('/__fastgpt_proxy/code-server/?folder=/home/sandbox');
  });

  it('also strips a stale _t when authenticating via cookie', () => {
    const tk = sign({ sid: 'abc', svc: 'code-server' });
    const r = authenticate(
      mkReq('abc.localhost:3006', '/?_t=garbage&keep=1', `${PROXY_COOKIE}=${tk}`)
    );
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.cleanedUrl).toBe('/?keep=1');
  });
});

describe('verifyProxyToken', () => {
  it('accepts a well-formed signed token', () => {
    const tk = jwt.sign(
      {
        sid: 'abc',
        svc: 'code-server'
      },
      SECRET,
      {
        expiresIn: DEFAULT_TTL_SECONDS
      }
    );
    expect(verifyProxyToken(tk)).toEqual({
      sid: 'abc',
      svc: 'code-server',
      exp: expect.any(Number)
    });
  });

  it('rejects a token signed with a different secret', () => {
    const tk = jwt.sign({ sid: 'abc', svc: 'code-server' }, 'other-secret-12345678', {
      expiresIn: DEFAULT_TTL_SECONDS
    });
    expect(verifyProxyToken(tk)).toBeNull();
  });

  it('rejects an expired token', () => {
    const tk = jwt.sign({ sid: 'abc', svc: 'code-server' }, SECRET, { expiresIn: -1 });
    expect(verifyProxyToken(tk)).toBeNull();
  });

  it('rejects a token missing required fields', () => {
    const tk = jwt.sign({ sid: 'abc' }, SECRET, { expiresIn: DEFAULT_TTL_SECONDS });
    expect(verifyProxyToken(tk)).toBeNull();
  });

  it('rejects a malformed token string', () => {
    expect(verifyProxyToken('not-a-jwt')).toBeNull();
    expect(verifyProxyToken('')).toBeNull();
  });

  it('rejects when types mismatch (e.g. sid is a number)', () => {
    const tk = jwt.sign({ sid: 123, svc: 'code-server' }, SECRET, {
      expiresIn: DEFAULT_TTL_SECONDS
    });
    expect(verifyProxyToken(tk)).toBeNull();
  });

  it('rejects unsupported services', () => {
    const tk = jwt.sign({ sid: 'abc', svc: 'terminal' }, SECRET, {
      expiresIn: DEFAULT_TTL_SECONDS
    });
    expect(verifyProxyToken(tk)).toBeNull();
  });
});

describe('stripBootstrapToken', () => {
  it('returns the input unchanged when no query', () => {
    expect(stripBootstrapToken('/foo/bar')).toBe('/foo/bar');
    expect(stripBootstrapToken('/')).toBe('/');
  });

  it('removes lone _t', () => {
    expect(stripBootstrapToken('/?_t=abc.def.ghi')).toBe('/');
  });

  it('removes _t while keeping other params', () => {
    expect(stripBootstrapToken('/__fastgpt_proxy/code-server/?_t=xyz&folder=/home/sandbox')).toBe(
      '/__fastgpt_proxy/code-server/?folder=/home/sandbox'
    );
    expect(stripBootstrapToken('/__fastgpt_proxy/code-server/?folder=/home/sandbox&_t=xyz')).toBe(
      '/__fastgpt_proxy/code-server/?folder=/home/sandbox'
    );
    expect(stripBootstrapToken('/path?a=1&_t=jwt&b=2')).toBe('/path?a=1&b=2');
  });

  it('preserves hash fragment', () => {
    expect(stripBootstrapToken('/p/?_t=xyz#section')).toBe('/p/#section');
    expect(stripBootstrapToken('/p/?a=1&_t=xyz#section')).toBe('/p/?a=1#section');
  });

  it('does not mistake other params containing _t as substring', () => {
    expect(stripBootstrapToken('/p/?my_t=x&other_t=y')).toBe('/p/?my_t=x&other_t=y');
  });
});
