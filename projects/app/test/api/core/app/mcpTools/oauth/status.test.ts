import { afterEach, describe, expect, it, vi } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { MongoMcpOAuthState } from '@fastgpt/service/core/app/mcpOAuth/schema';
import { buildMcpOAuthState, sha256Hex, writeMcpOAuthState } from '@fastgpt/service/core/app/mcpOAuth';
import { buildOAuthConfig, callRoute, createToolsetFixture } from './helpers';

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

import * as statusApi from '@/pages/api/core/app/mcpTools/oauth/status';
import { authApp } from '@fastgpt/service/support/permission/app/auth';

const mockedAuthApp = vi.mocked(authApp);
const appIds: Types.ObjectId[] = [];

describe('GET /api/core/app/mcpTools/oauth/status', () => {
  afterEach(async () => {
    await MongoMcpOAuthState.deleteMany({});
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

  it('projects an authorized token without leaking any secret material', async () => {
    const fixture = await setup({
      oauth: buildOAuthConfig({ credentialSeq: 3, includeToken: true })
    });

    const res = await callRoute(statusApi.default, {
      method: 'GET',
      query: { appId: fixture.appId, nodeId: fixture.nodeId }
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      schemaVersion: 1,
      state: 'authorized',
      authorized: true,
      hasAccessToken: true,
      hasRefreshToken: true
    });
    expect(res.body.credentialSeq).toBeUndefined();
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('access-token-value');
    expect(serialized).not.toContain('refresh-token-value');
    expect(serialized).not.toContain('"token"');
    expect(serialized).not.toContain('"secret"');
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('reports pending_authorization while an unconsumed state exists', async () => {
    const fixture = await setup({
      oauth: buildOAuthConfig({ includeToken: true })
    });
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
    await writeMcpOAuthState({ payload: built.payload, bindCookieHash: sha256Hex('cookie') });

    const res = await callRoute(statusApi.default, {
      method: 'GET',
      query: { appId: fixture.appId }
    });
    expect(res.body.state).toBe('pending_authorization');
  });

  it('keeps headers-mode toolsets out of the OAuth state machine', async () => {
    const fixture = await setup({ authMode: 'headers' });

    const res = await callRoute(statusApi.default, {
      method: 'GET',
      query: { appId: fixture.appId }
    });
    expect(res.body).toMatchObject({ state: 'headers', authorized: false, authMode: 'headers' });
  });

  it('reports config_error when oauth mode has no schemaVersion 1 config', async () => {
    const fixture = await setup({ oauth: { clientMode: 'auto' } });

    const res = await callRoute(statusApi.default, {
      method: 'GET',
      query: { appId: fixture.appId }
    });
    expect(res.body.state).toBe('config_error');
  });
});
