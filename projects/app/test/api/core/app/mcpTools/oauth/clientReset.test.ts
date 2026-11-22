import { afterEach, describe, expect, it, vi } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import {
  resetMcpOAuthFetchImpl,
  setMcpOAuthFetchImpl
} from '@fastgpt/service/core/app/mcpOAuth';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { buildOAuthConfig, callRoute, createToolsetFixture, readToolsetOAuth } from './helpers';

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

import * as resetApi from '@/pages/api/core/app/mcpTools/oauth/client/reset';
import { authApp } from '@fastgpt/service/support/permission/app/auth';

const mockedAuthApp = vi.mocked(authApp);
const appIds: Types.ObjectId[] = [];

describe('POST /api/core/app/mcpTools/oauth/client/reset', () => {
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

  it('deregisters the DCR client, revokes tokens and clears all credential fields', async () => {
    const fixture = await setup({
      oauth: buildOAuthConfig({
        credentialSeq: 5,
        includeToken: true,
        includeServer: true,
        revocationEndpoint: 'https://example.org/revoke',
        registrationClientUri: 'https://example.org/register/client-1',
        registrationAccessToken: 'registration-token'
      })
    });

    const calls: Array<{ method: string; url: string; authorization?: string }> = [];
    setMcpOAuthFetchImpl(async (url, init) => {
      calls.push({
        method: String(init?.method),
        url: url.toString(),
        authorization: new Headers(init?.headers).get('authorization') ?? undefined
      });
      if (String(init?.method) === 'DELETE') {
        return new Response(null, { status: 204 });
      }
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    });

    const res = await callRoute(resetApi.default, {
      method: 'POST',
      body: { appId: fixture.appId, confirm: true }
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ schemaVersion: 1, reset: true, deregistered: true });
    expect(calls[0]).toMatchObject({
      method: 'DELETE',
      url: 'https://example.org/register/client-1',
      authorization: 'Bearer registration-token'
    });
    expect(calls).toHaveLength(3);

    const oauth = await readToolsetOAuth(fixture.versionId);
    expect(oauth?.client).toBeUndefined();
    expect(oauth?.token).toBeUndefined();
    expect(oauth?.server).toBeUndefined();
    expect(oauth?.lastError).toBeUndefined();
    // Stage K10：clientSource 随 client 一起 $unset，绝不写 null（schema 只允许 cimd|dcr|manual）。
    expect(oauth?.clientSource).toBeUndefined();
    expect(oauth?.credentialSeq).toBe(6);
  });

  it('is idempotent when there is nothing to reset', async () => {
    const fixture = await setup({
      oauth: { schemaVersion: 1, clientMode: 'auto', credentialSeq: 0 }
    });
    let fetchCalls = 0;
    setMcpOAuthFetchImpl(async () => {
      fetchCalls += 1;
      return new Response(null, { status: 204 });
    });

    const res = await callRoute(resetApi.default, {
      method: 'POST',
      body: { appId: fixture.appId, confirm: true }
    });

    expect(res.body).toEqual({ schemaVersion: 1, reset: true, deregistered: false });
    expect(fetchCalls).toBe(0);
    expect((await readToolsetOAuth(fixture.versionId))?.credentialSeq).toBe(0);
  });
});
