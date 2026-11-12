import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { McpOAuthApiError } from '@fastgpt/service/core/app/mcpOAuth/errors';
import { callRoute, createToolsetFixture } from './oauth/helpers';

const mocks = vi.hoisted(() => ({
  authApp: vi.fn(),
  authCert: vi.fn(),
  getTools: vi.fn(),
  toolCall: vi.fn(),
  clientConfigs: [] as Array<{ url: string; headers: any }>,
  withMcpOAuthRetry: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: (handler: unknown) => handler
}));

vi.mock('@fastgpt/service/support/permission/app/auth', () => ({
  authApp: mocks.authApp
}));

vi.mock('@fastgpt/service/support/permission/auth/common', () => ({
  authCert: mocks.authCert
}));

vi.mock('@fastgpt/service/core/app/mcp', () => ({
  assertMCPUrlNotInternal: vi.fn(async () => undefined),
  MCPClient: vi.fn(function (this: any, config: any) {
    mocks.clientConfigs.push(config);
    this.getTools = mocks.getTools;
    this.toolCall = mocks.toolCall;
  })
}));

vi.mock('@fastgpt/service/core/app/mcpOAuth/runtime', () => ({
  withMcpOAuthRetry: mocks.withMcpOAuthRetry
}));

import * as getToolsApi from '@/pages/api/core/app/mcpTools/getTools';
import * as runToolApi from '@/pages/api/core/app/mcpTools/runTool';

const appIds: any[] = [];

describe('mcpTools runtime routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.clientConfigs.length = 0;
    mocks.authCert.mockResolvedValue({ teamId: 'team-1' });
    mocks.getTools.mockResolvedValue([]);
    mocks.toolCall.mockResolvedValue({ content: [] });
    mocks.withMcpOAuthRetry.mockImplementation(async ({ run }: any) =>
      run({ Authorization: 'Bearer fresh' })
    );
  });

  afterEach(async () => {
    await MongoApp.deleteMany({ _id: { $in: appIds } });
    await MongoAppVersion.deleteMany({});
    appIds.length = 0;
  });

  it('keeps legacy getTools behavior when appId is absent', async () => {
    const res = await callRoute(getToolsApi.default as any, {
      method: 'POST',
      body: { url: 'https://legacy.example.com/mcp', headerSecret: { Authorization: { value: 'x' } } }
    });

    expect(res.status).toBe(200);
    expect(mocks.authApp).not.toHaveBeenCalled();
    expect(mocks.authCert).toHaveBeenCalled();
    expect(mocks.clientConfigs[0].headers).toEqual({ Authorization: 'x' });  });

  it('resolves oauth node headers and retries once for getTools', async () => {
    const fixture = await createToolsetFixture({
      authMode: 'oauth',
      oauth: { schemaVersion: 1, clientMode: 'auto', credentialSeq: 2 }
    });
    appIds.push(fixture.app._id);
    mocks.authApp.mockResolvedValue({ app: fixture.app, appId: fixture.appId });

    const res = await callRoute(getToolsApi.default as any, {
      method: 'POST',
      body: { appId: fixture.appId, nodeId: fixture.nodeId }
    });

    expect(res.status).toBe(200);
    expect(mocks.withMcpOAuthRetry).toHaveBeenCalledWith(
      expect.objectContaining({ appId: fixture.appId, nodeId: fixture.nodeId })
    );
    expect(mocks.clientConfigs[0]).toMatchObject({
      url: 'https://example.org/mcp',
      headers: { Authorization: 'Bearer fresh' }
    });
  });

  it('rejects a URL mismatch against the stored node', async () => {
    const fixture = await createToolsetFixture({ authMode: 'oauth' });
    appIds.push(fixture.app._id);
    mocks.authApp.mockResolvedValue({ app: fixture.app, appId: fixture.appId });

    await expect(
      callRoute(runToolApi.default as any, {
        method: 'POST',
        body: {
          appId: fixture.appId,
          nodeId: fixture.nodeId,
          url: 'https://attacker.example.com/mcp',
          toolName: 'search',
          params: {}
        }
      })
    ).rejects.toMatchObject({ oauthCode: 'mcp_oauth_url_mismatch' });
    expect(mocks.toolCall).not.toHaveBeenCalled();
  });

  it('rejects nodeId without appId at schema validation', async () => {
    await expect(
      callRoute(runToolApi.default as any, {
        method: 'POST',
        body: { nodeId: 'node-1', url: 'https://example.org/mcp', toolName: 'search', params: {} }
      })
    ).rejects.toBeTruthy();
    expect(mocks.authCert).not.toHaveBeenCalled();
  });
});
