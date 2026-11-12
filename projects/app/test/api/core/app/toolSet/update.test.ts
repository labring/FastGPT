import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiRequestProps } from '@fastgpt/next/type';
import type { UpdateHttpToolsBodyType } from '@fastgpt/global/openapi/core/app/httpTools/api';
import type { UpdateMcpToolsBodyType } from '@fastgpt/global/openapi/core/app/mcpTools/api';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';

const mocks = vi.hoisted(() => ({
  authApp: vi.fn(),
  mongoSessionRun: vi.fn(),
  updateAppPublishedVersion: vi.fn(),
  beforeUpdateAppFormat: vi.fn(),
  updateParentFoldersUpdateTime: vi.fn(),
  assertMCPUrlNotInternal: vi.fn(),
  getMcpToolSetVersionDoc: vi.fn(),
  mergeMcpOAuthFromPublished: vi.fn()
}));

const createVersionDoc = (mcpToolSet: Record<string, any>) => ({
  nodes: [
    {
      nodeId: 'node-1',
      flowNodeType: 'toolSet',
      toolConfig: { mcpToolSet }
    }
  ]
});

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: (handler: unknown) => handler
}));

vi.mock('@fastgpt/service/support/permission/app/auth', () => ({
  authApp: mocks.authApp
}));

vi.mock('@fastgpt/service/common/mongo/sessionRun', () => ({
  mongoSessionRun: mocks.mongoSessionRun
}));

vi.mock('@fastgpt/service/core/app/version/controller', () => ({
  updateAppPublishedVersion: mocks.updateAppPublishedVersion
}));

vi.mock('@fastgpt/service/core/app/controller', () => ({
  beforeUpdateAppFormat: mocks.beforeUpdateAppFormat,
  updateParentFoldersUpdateTime: mocks.updateParentFoldersUpdateTime
}));

vi.mock('@fastgpt/service/common/secret/utils', () => ({
  storeSecretValue: vi.fn((value) => value)
}));

vi.mock('@fastgpt/service/core/app/mcp', () => ({
  assertMCPUrlNotInternal: mocks.assertMCPUrlNotInternal
}));

vi.mock('@fastgpt/service/core/app/mcpOAuth/credential', () => ({
  getMcpToolSetVersionDoc: mocks.getMcpToolSetVersionDoc,
  resolveMcpOAuthNode: (version: any) => version.nodes[0],
  getNodeMcpToolSet: (node: any) => node.toolConfig.mcpToolSet,
  mergeMcpOAuthFromPublished: mocks.mergeMcpOAuthFromPublished
}));

import updateHttpTools from '@/pages/api/core/app/httpTools/update';
import updateMcpTools from '@/pages/api/core/app/mcpTools/update';

const tool = { name: 'search', description: 'Search tool' };

const appId = '65f000000000000000000071';
const versionId = '65f000000000000000000072';

describe('tool set update handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authApp.mockResolvedValue({
      app: {
        _id: appId,
        name: 'Tool set',
        avatar: '',
        parentId: 'parent-id',
        publishedVersionId: versionId
      },
      teamId: 'team-id'
    });
    mocks.beforeUpdateAppFormat.mockResolvedValue(undefined);
    mocks.assertMCPUrlNotInternal.mockResolvedValue(undefined);
    mocks.mongoSessionRun.mockImplementation(async (fn: (session: string) => Promise<unknown>) =>
      fn('session')
    );
    mocks.updateAppPublishedVersion.mockRejectedValue(AppErrEnum.unExist);
    mocks.getMcpToolSetVersionDoc.mockResolvedValue(
      createVersionDoc({
        url: 'https://example.com/mcp',
        authMode: 'headers',
        headerSecret: {}
      })
    );
    mocks.mergeMcpOAuthFromPublished.mockReturnValue({
      oauth: undefined,
      credentialSeqDelta: 0
    });
  });

  it.each([
    {
      name: 'HTTP',
      handler: updateHttpTools,
      body: { appId, toolList: [] } as UpdateHttpToolsBodyType
    },
    {
      name: 'MCP',
      handler: updateMcpTools,
      body: {
        appId,
        url: 'https://example.com/mcp',
        toolList: [tool]
      } as UpdateMcpToolsBodyType
    }
  ])('propagates a $name published-version update failure', async ({ handler, body }) => {
    await expect(handler({ body } as ApiRequestProps<any>)).rejects.toBe(AppErrEnum.unExist);

    expect(mocks.updateAppPublishedVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        appId,
        resources: [],
        session: 'session'
      })
    );
    expect(mocks.updateParentFoldersUpdateTime).not.toHaveBeenCalled();
  });

  it('reuses the existing nodeId and fences oauth writes by credentialSeq', async () => {
    mocks.getMcpToolSetVersionDoc.mockResolvedValue(
      createVersionDoc({
        url: 'https://old.example.com/mcp',
        authMode: 'oauth',
        oauth: { schemaVersion: 1, credentialSeq: 3, clientMode: 'auto' }
      })
    );
    mocks.mergeMcpOAuthFromPublished.mockReturnValue({
      oauth: { schemaVersion: 1, clientMode: 'auto' },
      credentialSeqDelta: 1
    });
    mocks.updateAppPublishedVersion.mockResolvedValue(undefined);

    await updateMcpTools({
      body: {
        appId,
        url: 'https://new.example.com/mcp',
        toolList: [],
        authMode: 'oauth'
      }
    } as ApiRequestProps<any>);

    expect(mocks.mergeMcpOAuthFromPublished).toHaveBeenCalledWith(
      expect.objectContaining({
        previousAuthMode: 'oauth',
        nextAuthMode: 'oauth',
        urlChanged: true,
        existingOAuth: expect.objectContaining({ credentialSeq: 3 })
      })
    );
    const formattedNode = mocks.beforeUpdateAppFormat.mock.calls[0][0].nodes[0];
    expect(formattedNode.nodeId).toBe('node-1');
    expect(formattedNode.toolConfig.mcpToolSet.oauth.credentialSeq).toBe(4);
    expect(mocks.updateAppPublishedVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        nodeFence: { nodeId: 'node-1', credentialSeq: 3 }
      })
    );
  });

  it('does not take a credential fence on the first oauth enable', async () => {
    // 存量节点仍是 headers：此时存库节点没有 oauth.credentialSeq，带围栏必然匹配失败。
    mocks.mergeMcpOAuthFromPublished.mockReturnValue({
      oauth: { schemaVersion: 1, clientMode: 'auto', credentialSeq: 0 },
      credentialSeqDelta: 0
    });
    mocks.updateAppPublishedVersion.mockResolvedValue(undefined);

    await updateMcpTools({
      body: {
        appId,
        url: 'https://example.com/mcp',
        toolList: [tool],
        authMode: 'oauth',
        clientMode: 'auto'
      }
    } as ApiRequestProps<any>);

    const call = mocks.updateAppPublishedVersion.mock.calls[0][0];
    expect(call).not.toHaveProperty('nodeFence');
    expect(call.nodes).toHaveLength(1);
  });

  it('switches back to headers and keeps the node identity', async () => {
    mocks.getMcpToolSetVersionDoc.mockResolvedValue(
      createVersionDoc({
        url: 'https://example.com/mcp',
        authMode: 'oauth',
        oauth: { schemaVersion: 1, credentialSeq: 5 }
      })
    );
    mocks.mergeMcpOAuthFromPublished.mockReturnValue({
      oauth: { schemaVersion: 1, clientMode: 'auto' },
      credentialSeqDelta: 1
    });
    mocks.updateAppPublishedVersion.mockResolvedValue(undefined);

    await updateMcpTools({
      body: {
        appId,
        url: 'https://example.com/mcp',
        toolList: [tool],
        authMode: 'headers'
      }
    } as ApiRequestProps<any>);

    expect(mocks.mergeMcpOAuthFromPublished).toHaveBeenCalledWith(
      expect.objectContaining({
        previousAuthMode: 'oauth',
        nextAuthMode: 'headers',
        urlChanged: false
      })
    );
    const formattedNode = mocks.beforeUpdateAppFormat.mock.calls[0][0].nodes[0];
    expect(formattedNode.nodeId).toBe('node-1');
    expect(formattedNode.toolConfig.mcpToolSet.authMode).toBe('headers');
  });

  it('rejects an omitted authMode that resolves to headers with an empty toolList', async () => {
    // 存量节点是 headers；请求省略 authMode 且 toolList 为空时，schema 的 refine
    // 看不到真实模式，必须由 handler 按解析后的模式兜底拒绝。
    mocks.getMcpToolSetVersionDoc.mockResolvedValue(
      createVersionDoc({
        url: 'https://example.com/mcp',
        authMode: 'headers',
        headerSecret: {}
      })
    );

    await expect(
      updateMcpTools({
        body: {
          appId,
          url: 'https://example.com/mcp',
          toolList: []
        }
      } as ApiRequestProps<any>)
    ).rejects.toThrow('authMode=headers');

    expect(mocks.updateAppPublishedVersion).not.toHaveBeenCalled();
  });
});
