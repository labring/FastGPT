import { afterEach, describe, expect, it, vi } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import {
  buildMcpOAuthState,
  getMcpOAuthBindCookieName,
  resetMcpOAuthFetchImpl,
  setMcpOAuthFetchImpl,
  sha256Hex,
  writeMcpOAuthState
} from '@fastgpt/service/core/app/mcpOAuth';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { MongoMcpOAuthState } from '@fastgpt/service/core/app/mcpOAuth/schema';
import { decryptMcpOAuthAccessToken } from '@fastgpt/service/core/app/mcpOAuth/token';
import { callRoute, createToolsetFixture, jsonResponse, readToolsetOAuth } from './helpers';

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: (handler: unknown) => handler
}));

vi.mock('@fastgpt/service/core/app/mcpOAuth', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@fastgpt/service/core/app/mcpOAuth')>();
  return { ...actual, assertMcpOAuthEnabled: () => {} };
});

vi.mock('@fastgpt/service/support/permission/app/auth', () => ({
  authApp: vi.fn(),
  authAppByTmbId: vi.fn()
}));

vi.mock('@fastgpt/service/common/rateLimit/interface/mcpOAuth', () => ({
  assertMcpOAuthStartByAppRateLimit: vi.fn(async () => {}),
  assertMcpOAuthStartByUserRateLimit: vi.fn(async () => {}),
  assertMcpOAuthCallbackByAppRateLimit: vi.fn(async () => {}),
  assertMcpOAuthCallbackByIpRateLimit: vi.fn(async () => {}),
  assertMcpOAuthDisconnectByAppRateLimit: vi.fn(async () => {}),
  assertMcpOAuthClientResetByAppRateLimit: vi.fn(async () => {}),
  assertMcpOAuthClientMetadataByIpRateLimit: vi.fn(async () => {}),
  getMcpOAuthIpRateLimitSegment: (ip: string) => `seg-${ip}`
}));

import * as callbackApi from '@/pages/api/core/app/mcpTools/oauth/callback';
import { authAppByTmbId } from '@fastgpt/service/support/permission/app/auth';

const mockedAuthAppByTmbId = vi.mocked(authAppByTmbId);
const appIds: Types.ObjectId[] = [];
const BIND_COOKIE = 'bind-cookie-value';

describe('GET /api/core/app/mcpTools/oauth/callback', () => {
  afterEach(async () => {
    resetMcpOAuthFetchImpl();
    await MongoMcpOAuthState.deleteMany({});
    await MongoAppVersion.deleteMany({});
    await MongoApp.deleteMany({ _id: { $in: appIds } });
    appIds.length = 0;
    vi.clearAllMocks();
  });

  const setup = async (
    oauth: Record<string, unknown> = {
      schemaVersion: 1,
      clientMode: 'manual',
      credentialSeq: 0,
      clientSource: 'dcr',
      issuer: 'https://example.org/',
      resource: 'https://example.org/mcp',
      client: { clientId: 'client-1', tokenEndpointAuthMethod: 'none' },
      server: {
        issuer: 'https://example.org/',
        authorizationEndpoint: 'https://example.org/authorize',
        tokenEndpoint: 'https://example.org/token',
        source: 'discovered',
        fetchedAt: 0
      }
    }
  ) => {
    const fixture = await createToolsetFixture({ oauth });
    appIds.push(new Types.ObjectId(fixture.appId));
    mockedAuthAppByTmbId.mockResolvedValue({
      app: { ...fixture.app, type: 'toolSet', teamId: new Types.ObjectId(fixture.teamId) }
    } as never);

    const built = buildMcpOAuthState({
      appId: fixture.appId,
      nodeId: fixture.nodeId,
      teamId: fixture.teamId,
      tmbId: fixture.tmbId,
      redirectUri: 'https://fastgpt.example.com/api/core/app/mcpTools/oauth/callback',
      codeVerifier: 'v'.repeat(64),
      issuer: 'https://example.org/',
      resource: 'https://example.org/mcp',
      clientIdHash: sha256Hex('client-1')
    });
    await writeMcpOAuthState({
      payload: built.payload,
      bindCookieHash: sha256Hex(BIND_COOKIE)
    });

    return {
      fixture,
      state: built.state,
      cookie: `${getMcpOAuthBindCookieName(fixture.appId)}=${BIND_COOKIE}`
    };
  };

  it('exchanges the code once, persists an encrypted token and redirects to detail', async () => {
    const { fixture, state, cookie } = await setup();
    let tokenCalls = 0;
    setMcpOAuthFetchImpl(async (url, init) => {
      expect(url.toString()).toBe('https://example.org/token');
      tokenCalls += 1;
      const body = new URLSearchParams(String(init?.body));
      expect(body.get('grant_type')).toBe('authorization_code');
      expect(body.get('code')).toBe('code-1');
      expect(body.get('code_verifier')).toBe('v'.repeat(64));
      return jsonResponse({
        access_token: 'new-access',
        refresh_token: 'new-refresh',
        token_type: 'Bearer',
        expires_in: 600
      });
    });

    const res = await callRoute(callbackApi.default, {
      method: 'GET',
      query: { state, code: 'code-1', iss: 'https://example.org' },
      headers: { cookie }
    });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(
      `https://fastgpt.example.com/app/detail?appId=${fixture.appId}&oauth=success`
    );
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['set-cookie']).toContain('Max-Age=0');
    expect(tokenCalls).toBe(1);

    const oauth = await readToolsetOAuth(fixture.versionId);
    expect(oauth?.credentialSeq).toBe(1);
    expect(oauth?.lastError).toBeNull();
    expect(decryptMcpOAuthAccessToken(oauth?.token)).toBe('new-access');
    expect(JSON.stringify(oauth?.token)).not.toContain('new-access');
  });

  it('rejects a replayed state without a second token exchange', async () => {
    const { fixture, state, cookie } = await setup();
    let tokenCalls = 0;
    setMcpOAuthFetchImpl(async () => {
      tokenCalls += 1;
      return jsonResponse({ access_token: 'a', token_type: 'Bearer', expires_in: 60 });
    });

    const first = await callRoute(callbackApi.default, {
      method: 'GET',
      query: { state, code: 'code-1' },
      headers: { cookie }
    });
    expect(first.headers.location).toContain('oauth=success');

    const second = await callRoute(callbackApi.default, {
      method: 'GET',
      query: { state, code: 'code-1' },
      headers: { cookie }
    });
    expect(second.status).toBe(302);
    expect(second.headers.location).toBe(
      `https://fastgpt.example.com/app/detail?appId=${fixture.appId}&oauth=error&code=mcp_oauth_state_replayed`
    );
    expect(tokenCalls).toBe(1);

    const oauth = await readToolsetOAuth(fixture.versionId);
    expect(oauth?.credentialSeq).toBe(1);
  });

  it('requires the browser binding cookie', async () => {
    const { state } = await setup();
    let tokenCalls = 0;
    setMcpOAuthFetchImpl(async () => {
      tokenCalls += 1;
      return jsonResponse({ access_token: 'a', token_type: 'Bearer' });
    });

    const res = await callRoute(callbackApi.default, {
      method: 'GET',
      query: { state, code: 'code-1' }
    });
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('code=mcp_oauth_state_cookie_missing');
    expect(tokenCalls).toBe(0);
  });

  it('rejects a mismatched binding cookie', async () => {
    const { fixture, state } = await setup();
    const res = await callRoute(callbackApi.default, {
      method: 'GET',
      query: { state, code: 'code-1' },
      headers: { cookie: `${getMcpOAuthBindCookieName(fixture.appId)}=other-value` }
    });
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('code=mcp_oauth_state_binding_mismatch');
  });

  it('rejects an issuer that differs from the state', async () => {
    const { state, cookie } = await setup();
    const res = await callRoute(callbackApi.default, {
      method: 'GET',
      query: { state, code: 'code-1', iss: 'https://evil.example.com' },
      headers: { cookie }
    });
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('code=mcp_oauth_issuer_mismatch');
  });

  it('maps an AS error response to access_denied', async () => {
    const { state, cookie } = await setup();
    const res = await callRoute(callbackApi.default, {
      method: 'GET',
      query: { state, error: 'access_denied' },
      headers: { cookie }
    });
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('code=mcp_oauth_access_denied');
  });

  it('returns JSON 400 for an undecryptable state', async () => {
    const res = await callRoute(callbackApi.default, {
      method: 'GET',
      query: { state: 'not-a-valid-state' }
    });
    expect(res.status).toBe(400);
    expect(res.body.data.oauthCode).toBe('mcp_oauth_state_invalid');
  });

  it('rejects a cross-origin callback before consuming state', async () => {
    const { state, cookie } = await setup();
    const res = await callRoute(callbackApi.default, {
      method: 'GET',
      query: { state, code: 'code-1' },
      headers: { cookie, origin: 'https://evil.example.com' }
    });
    expect(res.status).toBe(400);
    expect(res.body.data.oauthCode).toBe('mcp_oauth_state_invalid');
    expect(await MongoMcpOAuthState.countDocuments({ consumedAt: { $exists: true } })).toBe(0);
  });
});
