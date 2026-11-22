import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { McpOAuthApiError } from '@fastgpt/service/core/app/mcpOAuth/errors';
import { McpOAuthErrorCodeEnum } from '@fastgpt/global/core/app/tool/mcpTool/oauth';
import { PRIVATE_URL_TEXT } from '@fastgpt/global/common/system/network';
import { callRoute, createToolsetFixture } from './oauth/helpers';

const mocks = vi.hoisted(() => ({
  authApp: vi.fn(),
  authCert: vi.fn(),
  getTools: vi.fn(),
  toolCall: vi.fn(),
  assertMCPUrlNotInternal: vi.fn(),
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
  assertMCPUrlNotInternal: mocks.assertMCPUrlNotInternal,
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
    mocks.assertMCPUrlNotInternal.mockResolvedValue(undefined);
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
      body: {
        url: 'https://legacy.example.com/mcp',
        headerSecret: { Authorization: { value: 'x' } }
      }
    });

    expect(res.status).toBe(200);
    expect(mocks.authApp).not.toHaveBeenCalled();
    expect(mocks.authCert).toHaveBeenCalled();
    expect(mocks.clientConfigs[0].headers).toEqual({ Authorization: 'x' });
  });

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

  describe('oauth 模式运行期错误返回结构化固定码', () => {
    const setupOAuthFixture = async () => {
      const fixture = await createToolsetFixture({ authMode: 'oauth' });
      appIds.push(fixture.app._id);
      mocks.authApp.mockResolvedValue({ app: fixture.app, appId: fixture.appId });
      return fixture;
    };

    const expectEnvelope = (
      res: Awaited<ReturnType<typeof callRoute>>,
      status: number,
      oauthCode: string
    ) => {
      expect(res.status).toBe(status);
      expect(res.body).toMatchObject({
        code: status,
        statusText: 'error',
        data: { oauthCode, retryable: expect.any(Boolean) }
      });
      expect(typeof res.body.data.requestId).toBe('string');
      expect(res.body.data.requestId.length).toBeGreaterThan(0);
      // 固定 envelope 不得带上 AS 原文 / token / client secret。
      expect(res.body.data).not.toHaveProperty('error_description');
      expect(JSON.stringify(res.body)).not.toMatch(
        /Bearer\s|access_token|refresh_token|client_secret/
      );
    };

    it('getTools: reauth_required -> HTTP 401 + oauthCode', async () => {
      const fixture = await setupOAuthFixture();
      mocks.withMcpOAuthRetry.mockRejectedValue(
        new McpOAuthApiError(McpOAuthErrorCodeEnum.reauthRequired, {
          message: 'MCP server rejected the refreshed token'
        })
      );

      const res = await callRoute(getToolsApi.default as any, {
        method: 'POST',
        body: { appId: fixture.appId, nodeId: fixture.nodeId }
      });

      expectEnvelope(res, 401, McpOAuthErrorCodeEnum.reauthRequired);
      expect(mocks.withMcpOAuthRetry).toHaveBeenCalledTimes(1);
    });

    it('getTools: insufficient_scope -> HTTP 403 + oauthCode', async () => {
      const fixture = await setupOAuthFixture();
      mocks.withMcpOAuthRetry.mockRejectedValue(
        new McpOAuthApiError(McpOAuthErrorCodeEnum.insufficientScope)
      );

      const res = await callRoute(getToolsApi.default as any, {
        method: 'POST',
        body: { appId: fixture.appId, nodeId: fixture.nodeId }
      });

      expectEnvelope(res, 403, McpOAuthErrorCodeEnum.insufficientScope);
    });

    it('getTools: discovery 失败 -> HTTP 502 + oauthCode', async () => {
      const fixture = await setupOAuthFixture();
      mocks.withMcpOAuthRetry.mockRejectedValue(
        new McpOAuthApiError(McpOAuthErrorCodeEnum.discoveryFailed)
      );

      const res = await callRoute(getToolsApi.default as any, {
        method: 'POST',
        body: { appId: fixture.appId, nodeId: fixture.nodeId }
      });

      expectEnvelope(res, 502, McpOAuthErrorCodeEnum.discoveryFailed);
    });

    it('oauth 模式私有地址 -> HTTP 400 + private_url', async () => {
      const fixture = await setupOAuthFixture();
      mocks.assertMCPUrlNotInternal.mockRejectedValueOnce(PRIVATE_URL_TEXT);

      const res = await callRoute(getToolsApi.default as any, {
        method: 'POST',
        body: { appId: fixture.appId, nodeId: fixture.nodeId }
      });

      expectEnvelope(res, 400, McpOAuthErrorCodeEnum.privateUrl);
      expect(mocks.withMcpOAuthRetry).not.toHaveBeenCalled();
    });

    it('runTool: reauth_required -> HTTP 401 + oauthCode，且只发起一次重试链路', async () => {
      const fixture = await setupOAuthFixture();
      mocks.withMcpOAuthRetry.mockRejectedValue(
        new McpOAuthApiError(McpOAuthErrorCodeEnum.reauthRequired, {
          message: 'MCP server rejected the refreshed token'
        })
      );

      const res = await callRoute(runToolApi.default as any, {
        method: 'POST',
        body: {
          appId: fixture.appId,
          nodeId: fixture.nodeId,
          toolName: 'search',
          params: {}
        }
      });

      expectEnvelope(res, 401, McpOAuthErrorCodeEnum.reauthRequired);
      expect(mocks.withMcpOAuthRetry).toHaveBeenCalledTimes(1);
      expect(mocks.toolCall).not.toHaveBeenCalled();
    });

    it('runTool: 第二次 401 仍由同一错误码映射（不会无限重试）', async () => {
      const fixture = await setupOAuthFixture();
      mocks.withMcpOAuthRetry.mockRejectedValue(
        new McpOAuthApiError(McpOAuthErrorCodeEnum.reauthRequired, {
          message: 'MCP server rejected the refreshed token'
        })
      );

      const res = await callRoute(runToolApi.default as any, {
        method: 'POST',
        body: {
          appId: fixture.appId,
          nodeId: fixture.nodeId,
          toolName: 'echo',
          params: { text: 'x' }
        }
      });

      expectEnvelope(res, 401, McpOAuthErrorCodeEnum.reauthRequired);
      expect(mocks.withMcpOAuthRetry).toHaveBeenCalledTimes(1);
    });
  });

  describe('headers 模式回归', () => {
    it('headers 分支的 MCP 失败仍走原有错误路径（无 oauthCode）', async () => {
      const fixture = await createToolsetFixture({ authMode: 'headers' });
      appIds.push(fixture.app._id);
      mocks.authApp.mockResolvedValue({ app: fixture.app, appId: fixture.appId });
      const plainError = new Error('MCP server exploded');
      mocks.getTools.mockRejectedValue(plainError);

      await expect(
        callRoute(getToolsApi.default as any, {
          method: 'POST',
          body: { appId: fixture.appId, nodeId: fixture.nodeId }
        })
      ).rejects.toBe(plainError);
      expect(mocks.withMcpOAuthRetry).not.toHaveBeenCalled();
    });

    it('headers 分支的私有地址断言保持原样（不被 oauth envelope 接管）', async () => {
      const fixture = await createToolsetFixture({ authMode: 'headers' });
      appIds.push(fixture.app._id);
      mocks.authApp.mockResolvedValue({ app: fixture.app, appId: fixture.appId });
      mocks.assertMCPUrlNotInternal.mockRejectedValueOnce(PRIVATE_URL_TEXT);

      await expect(
        callRoute(getToolsApi.default as any, {
          method: 'POST',
          body: { appId: fixture.appId, nodeId: fixture.nodeId }
        })
      ).rejects.toBe(PRIVATE_URL_TEXT);
    });
  });
});
