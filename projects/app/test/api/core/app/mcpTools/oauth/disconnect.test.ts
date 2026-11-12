import { afterEach, describe, expect, it, vi } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import {
  resetMcpOAuthFetchImpl,
  setMcpOAuthFetchImpl
} from '@fastgpt/service/core/app/mcpOAuth';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { buildOAuthConfig, callRoute, createToolsetFixture, jsonResponse, readToolsetOAuth } from './helpers';

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

import * as disconnectApi from '@/pages/api/core/app/mcpTools/oauth/disconnect';
import { authApp } from '@fastgpt/service/support/permission/app/auth';

const mockedAuthApp = vi.mocked(authApp);
const appIds: Types.ObjectId[] = [];

describe('POST /api/core/app/mcpTools/oauth/disconnect', () => {
  afterEach(async () => {
    resetMcpOAuthFetchImpl();
    await MongoAppVersion.deleteMany({});
    await MongoApp.deleteMany({ _id: { $in: appIds } });
    appIds.length = 0;
    vi.clearAllMocks();
  });

  const setup = async (options: Parameters<typeof createToolsetFixture>[0] = {}) => {
    const fixture = await createToolsetFixture(options);
    appIds.push(new Types.ObjectId(fixture.appId));
    mockedAuthApp.mockResolvedValue({ app: fixture.app, tmbId: fixture.tmbId } as never);
    return fixture;
  };

  it('clears the local token first and then revokes access + refresh tokens', async () => {
    const fixture = await setup({
      oauth: buildOAuthConfig({
        credentialSeq: 2,
        includeToken: true,
        revocationEndpoint: 'https://example.org/revoke'
      })
    });

    const revocations: Array<{ token: string; hint: string }> = [];
    setMcpOAuthFetchImpl(async (url, init) => {
      expect(url.toString()).toBe('https://example.org/revoke');
      const body = new URLSearchParams(String(init?.body));
      revocations.push({
        token: String(body.get('token')),
        hint: String(body.get('token_type_hint'))
      });
      return jsonResponse({}, 200);
    });

    const res = await callRoute(disconnectApi.default, {
      method: 'POST',
      body: { appId: fixture.appId, confirm: true }
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      schemaVersion: 1,
      disconnected: true,
      revoked: true,
      revokeError: null
    });
    expect(revocations.map((item) => item.hint)).toEqual(['access_token', 'refresh_token']);
    expect(revocations.map((item) => item.token)).toEqual([
      'access-token-value',
      'refresh-token-value'
    ]);

    const oauth = await readToolsetOAuth(fixture.versionId);
    expect(oauth?.token).toBeUndefined();
    expect(oauth?.lastError).toBeUndefined();
    expect(oauth?.credentialSeq).toBe(3);
  });

  it('is idempotent when there is no token and does not bump the sequence', async () => {
    const fixture = await setup({ oauth: buildOAuthConfig({ credentialSeq: 4 }) });
    let fetchCalls = 0;
    setMcpOAuthFetchImpl(async () => {
      fetchCalls += 1;
      return jsonResponse({}, 200);
    });

    const res = await callRoute(disconnectApi.default, {
      method: 'POST',
      body: { appId: fixture.appId, confirm: true }
    });

    expect(res.body).toMatchObject({ disconnected: true, revoked: false });
    expect(fetchCalls).toBe(0);
    expect((await readToolsetOAuth(fixture.versionId))?.credentialSeq).toBe(4);
  });

  it('rejects a toolset that is not in oauth mode', async () => {
    const fixture = await setup({ authMode: 'headers' });
    const res = await callRoute(disconnectApi.default, {
      method: 'POST',
      body: { appId: fixture.appId, confirm: true }
    });
    expect(res.status).toBe(400);
    expect(res.body.data.oauthCode).toBe('mcp_oauth_not_oauth_mode');
  });
});
