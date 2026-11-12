import { afterEach, describe, expect, it, vi } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { resetMcpOAuthFetchImpl, setMcpOAuthFetchImpl } from '@fastgpt/service/core/app/mcpOAuth';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { MongoMcpOAuthState } from '@fastgpt/service/core/app/mcpOAuth/schema';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { callRoute, createToolsetFixture, jsonResponse, readToolsetOAuth } from './helpers';

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: (handler: unknown) => handler
}));

// 测试进程的 serviceEnv 在 setup 阶段已初始化（MCP_OAUTH_ENABLED 默认 false），
// 这里只放开开关断言，其余服务实现保持真实。
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

import * as startApi from '@/pages/api/core/app/mcpTools/oauth/start';
import { authApp } from '@fastgpt/service/support/permission/app/auth';

const mockedAuthApp = vi.mocked(authApp);
const appIds: Types.ObjectId[] = [];

const mockDiscovery = (issuer = 'https://example.org') => {
  setMcpOAuthFetchImpl(async (url, init) => {
    const value = url.toString();
    if (value === 'https://example.org/mcp' && init?.method === 'POST') {
      return jsonResponse(
        { jsonrpc: '2.0', error: { code: -32001, message: 'Unauthorized' }, id: 1 },
        401,
        {
          'www-authenticate': 'Bearer resource_metadata="https://example.org/prm"'
        }
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
        code_challenge_methods_supported: ['S256'],
        client_id_metadata_document_supported: true
      });
    }
    return jsonResponse({}, 404);
  });
};

describe('POST /api/core/app/mcpTools/oauth/start', () => {
  afterEach(async () => {
    resetMcpOAuthFetchImpl();
    await MongoMcpOAuthState.deleteMany({});
    await MongoAppVersion.deleteMany({});
    await MongoApp.deleteMany({ _id: { $in: appIds } });
    appIds.length = 0;
    vi.clearAllMocks();
  });

  const setup = async (options: Parameters<typeof createToolsetFixture>[0] = {}) => {
    const fixture = await createToolsetFixture(options);
    appIds.push(new Types.ObjectId(fixture.appId));
    mockedAuthApp.mockResolvedValue({
      app: fixture.app,
      tmbId: fixture.tmbId
    } as never);
    return fixture;
  };

  it('discovers the AS, selects CIMD in auto mode and returns a PKCE authorization URL', async () => {
    const fixture = await setup();
    mockDiscovery();

    const res = await callRoute(startApi.default, {
      method: 'POST',
      body: { appId: fixture.appId, nodeId: fixture.nodeId }
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      schemaVersion: 1,
      clientMode: 'auto',
      clientSource: 'cimd',
      issuer: 'https://example.org/',
      resource: 'https://example.org/mcp'
    });

    const authorization = new URL(res.body.authorizationUrl);
    expect(authorization.origin).toBe('https://example.org');
    expect(authorization.pathname).toBe('/authorize');
    expect(authorization.searchParams.get('response_type')).toBe('code');
    expect(authorization.searchParams.get('code_challenge_method')).toBe('S256');
    expect(authorization.searchParams.get('resource')).toBe('https://example.org/mcp');
    expect(authorization.searchParams.get('state')).toBeTruthy();
    expect(authorization.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);

    expect(res.headers['set-cookie']).toContain(`mcp_oauth_bind_${fixture.appId}=`);

    const oauth = await readToolsetOAuth(fixture.versionId);
    expect(oauth).toMatchObject({
      clientSource: 'cimd',
      issuer: 'https://example.org/',
      resource: 'https://example.org/mcp'
    });
    expect(oauth?.client?.clientId).toContain('/api/core/app/mcpTools/oauth/client-metadata.json');

    const ledger = await MongoMcpOAuthState.findOne({ appId: fixture.appId });
    expect(ledger?.consumedAt).toBeUndefined();
  });

  it('rejects a non-toolset app before any network call', async () => {
    const fixture = await setup({ appType: AppTypeEnum.simple });
    let fetchCalls = 0;
    setMcpOAuthFetchImpl(async () => {
      fetchCalls += 1;
      return jsonResponse({}, 500);
    });

    const res = await callRoute(startApi.default, {
      method: 'POST',
      body: { appId: fixture.appId }
    });

    expect(res.status).toBe(400);
    expect(res.body.data.oauthCode).toBe('mcp_oauth_not_toolset');
    expect(fetchCalls).toBe(0);
  });

  it('returns a conflict when discovery moves the issuer of an existing credential', async () => {
    const fixture = await setup({
      oauth: {
        schemaVersion: 1,
        clientMode: 'auto',
        credentialSeq: 2,
        issuer: 'https://old.example.net/',
        resource: 'https://example.org/mcp'
      }
    });
    mockDiscovery('https://example.org');

    const res = await callRoute(startApi.default, {
      method: 'POST',
      body: { appId: fixture.appId }
    });

    expect(res.status).toBe(409);
    expect(res.body.data.oauthCode).toBe('mcp_oauth_issuer_changed');
  });
});
