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
import type { McpOAuthClientSource } from '@fastgpt/global/core/app/tool/mcpTool/oauth';

const mockedAuthAppByTmbId = vi.mocked(authAppByTmbId);
const appIds: Types.ObjectId[] = [];
const BIND_COOKIE = 'bind-cookie-value';
const CIMD_CLIENT_ID =
  'https://fastgpt.example.com/api/core/app/mcpTools/oauth/client-metadata.json';

/** auto + CIMD 已选中、AS 同时声明 DCR 的节点配置。 */
const cimdOAuth = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  clientMode: 'auto',
  credentialSeq: 0,
  clientSource: 'cimd',
  issuer: 'https://example.org/',
  resource: 'https://example.org/mcp',
  client: { clientId: CIMD_CLIENT_ID, tokenEndpointAuthMethod: 'none' },
  server: {
    issuer: 'https://example.org/',
    authorizationEndpoint: 'https://example.org/authorize',
    tokenEndpoint: 'https://example.org/token',
    registrationEndpoint: 'https://example.org/register',
    clientIdMetadataDocumentSupported: true,
    codeChallengeMethodsSupported: ['S256'],
    source: 'discovered',
    fetchedAt: 0
  },
  ...overrides
});

/** 回调自动降级所需的发现 + DCR mock；返回 `/register` 计数。 */
const mockDowngradeFetch = (issuer = 'https://example.org') => {
  const stats = { register: 0 };
  setMcpOAuthFetchImpl(async (url, init) => {
    const value = url.toString();
    if (value === 'https://example.org/mcp' && init?.method === 'POST') {
      return jsonResponse(
        { jsonrpc: '2.0', error: { code: -32001, message: 'Unauthorized' }, id: 1 },
        401,
        { 'www-authenticate': 'Bearer resource_metadata="https://example.org/prm"' }
      );
    }
    if (value === 'https://example.org/prm') {
      return jsonResponse({
        resource: 'https://example.org/mcp',
        authorization_servers: [issuer]
      });
    }
    if (value === `${issuer}/.well-known/oauth-authorization-server`) {
      return jsonResponse({
        issuer,
        authorization_endpoint: `${issuer}/authorize`,
        token_endpoint: `${issuer}/token`,
        registration_endpoint: `${issuer}/register`,
        code_challenge_methods_supported: ['S256'],
        client_id_metadata_document_supported: true
      });
    }
    if (value === `${issuer}/register` && init?.method === 'POST') {
      stats.register += 1;
      return jsonResponse({ client_id: 'dcr-client', token_endpoint_auth_method: 'none' }, 201);
    }
    return jsonResponse({}, 404);
  });
  return stats;
};

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
    },
    { ledgerClientSource }: { ledgerClientSource?: McpOAuthClientSource } = {}
  ) => {
    const fixture = await createToolsetFixture({ oauth });
    appIds.push(new Types.ObjectId(fixture.appId));
    mockedAuthAppByTmbId.mockResolvedValue({
      app: { ...fixture.app, type: 'toolSet', teamId: new Types.ObjectId(fixture.teamId) }
    } as never);

    const oauthClient = oauth.client as { clientId?: unknown } | undefined;
    const clientId =
      typeof oauthClient?.clientId === 'string' ? oauthClient.clientId : 'client-1';

    const built = buildMcpOAuthState({
      appId: fixture.appId,
      nodeId: fixture.nodeId,
      teamId: fixture.teamId,
      tmbId: fixture.tmbId,
      redirectUri: 'https://fastgpt.example.com/api/core/app/mcpTools/oauth/callback',
      codeVerifier: 'v'.repeat(64),
      issuer: 'https://example.org/',
      resource: 'https://example.org/mcp',
      clientIdHash: sha256Hex(clientId)
    });
    await writeMcpOAuthState({
      payload: built.payload,
      bindCookieHash: sha256Hex(BIND_COOKIE),
      ...(ledgerClientSource ? { clientSource: ledgerClientSource } : {})
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

  it.each(['invalid_client', 'invalid_request', 'unauthorized_client'])(
    'auto-degrades a CIMD attempt to DCR exactly once on %s',
    async (asError) => {
      const { fixture, state, cookie } = await setup(cimdOAuth(), {
        ledgerClientSource: 'cimd'
      });
      const stats = mockDowngradeFetch();

      const res = await callRoute(callbackApi.default, {
        method: 'GET',
        query: { state, error: asError },
        headers: { cookie }
      });

      expect(res.status).toBe(302);
      const location = new URL(res.headers.location);
      // 直接 302 到新的真实授权 URL，而不是详情页。
      expect(`${location.origin}${location.pathname}`).toBe('https://example.org/authorize');
      expect(location.searchParams.get('client_id')).toBe('dcr-client');
      expect(location.searchParams.get('state')).toBeTruthy();
      expect(location.searchParams.get('code_challenge_method')).toBe('S256');
      expect(res.headers['set-cookie']).toContain(`mcp_oauth_bind_${fixture.appId}=`);
      expect(stats.register).toBe(1);

      const oauth = await readToolsetOAuth(fixture.versionId);
      expect(oauth).toMatchObject({ clientSource: 'dcr', autoDcrFallback: true });
      expect(oauth?.client?.clientId).toBe('dcr-client');
      expect(oauth?.token).toBeUndefined();

      const oldLedger = await MongoMcpOAuthState.findOne({
        appId: fixture.appId,
        clientSource: 'cimd'
      });
      expect(oldLedger?.consumedAt).toBeTruthy();
      expect(oldLedger?.downgradedAt).toBeTruthy();
      const newLedger = await MongoMcpOAuthState.findOne({
        appId: fixture.appId,
        clientSource: 'dcr'
      });
      expect(newLedger?.consumedAt).toBeUndefined();

      // 同一条台账只能降级一次：重放旧 state 直接被拒，不会再次注册/跳转。
      const replay = await callRoute(callbackApi.default, {
        method: 'GET',
        query: { state, error: asError },
        headers: { cookie }
      });
      expect(replay.status).toBe(302);
      expect(replay.headers.location).toContain('code=mcp_oauth_state_replayed');
      expect(stats.register).toBe(1);
    }
  );

  it('does not downgrade when the user explicitly denies access', async () => {
    const { fixture, state, cookie } = await setup(cimdOAuth(), {
      ledgerClientSource: 'cimd'
    });
    let fetchCalls = 0;
    setMcpOAuthFetchImpl(async () => {
      fetchCalls += 1;
      return jsonResponse({}, 500);
    });

    const res = await callRoute(callbackApi.default, {
      method: 'GET',
      query: { state, error: 'access_denied' },
      headers: { cookie }
    });

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('code=mcp_oauth_access_denied');
    expect(fetchCalls).toBe(0);
    const oauth = await readToolsetOAuth(fixture.versionId);
    expect(oauth).toMatchObject({ clientSource: 'cimd' });
    expect(oauth?.autoDcrFallback).toBeUndefined();
  });

  it('returns a fixed error code for DCR callback errors without downgrading again', async () => {
    const { fixture, state, cookie } = await setup(
      {
        schemaVersion: 1,
        clientMode: 'auto',
        credentialSeq: 0,
        clientSource: 'dcr',
        autoDcrFallback: true,
        issuer: 'https://example.org/',
        resource: 'https://example.org/mcp',
        client: { clientId: 'dcr-client', tokenEndpointAuthMethod: 'none' }
      },
      { ledgerClientSource: 'dcr' }
    );
    let fetchCalls = 0;
    setMcpOAuthFetchImpl(async () => {
      fetchCalls += 1;
      return jsonResponse({}, 500);
    });

    const res = await callRoute(callbackApi.default, {
      method: 'GET',
      query: { state, error: 'invalid_client' },
      headers: { cookie }
    });

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('code=mcp_oauth_client_rejected');
    expect(fetchCalls).toBe(0);
    expect((await readToolsetOAuth(fixture.versionId))?.client?.clientId).toBe('dcr-client');
  });

  it('does not downgrade when the DCR fallback is already active', async () => {
    const { state, cookie } = await setup(cimdOAuth({ autoDcrFallback: true }), {
      ledgerClientSource: 'cimd'
    });
    let fetchCalls = 0;
    setMcpOAuthFetchImpl(async () => {
      fetchCalls += 1;
      return jsonResponse({}, 500);
    });

    const res = await callRoute(callbackApi.default, {
      method: 'GET',
      query: { state, error: 'invalid_client' },
      headers: { cookie }
    });

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('code=mcp_oauth_client_rejected');
    expect(fetchCalls).toBe(0);
  });
});
