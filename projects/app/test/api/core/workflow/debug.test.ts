import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HTTP_PROXY_CONFIGURED } from '@fastgpt/service/core/app/httpProxySecret';
import { encryptSecretValue } from '@fastgpt/service/common/secret/utils';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';

const mocks = vi.hoisted(() => ({
  authApp: vi.fn(),
  authCert: vi.fn(),
  composeDebugNodeResponseMap: vi.fn(),
  createChatUsageRecord: vi.fn(),
  dispatchWorkFlow: vi.fn(),
  getNanoid: vi.fn(),
  getAppDraftWorkflow: vi.fn(),
  getAppDraftVersion: vi.fn(),
  getRunningUserInfoByTmbId: vi.fn(),
  getWorkflowFinalResponseData: vi.fn(),
  prepareAppWorkflowResources: vi.fn(),
  prepareWorkflowFileQuery: vi.fn()
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

vi.mock('@fastgpt/service/core/workflow/dispatch', () => ({
  dispatchWorkFlow: mocks.dispatchWorkFlow
}));

vi.mock('@fastgpt/service/core/app/version/controller', () => ({
  getAppDraftWorkflow: mocks.getAppDraftWorkflow,
  getAppDraftVersion: mocks.getAppDraftVersion
}));

vi.mock('@fastgpt/service/core/app/resource/service', () => ({
  prepareAppWorkflowResources: mocks.prepareAppWorkflowResources
}));

vi.mock('@fastgpt/service/core/workflow/utils/fileLimits', () => ({
  prepareWorkflowFileQuery: mocks.prepareWorkflowFileQuery
}));

vi.mock('@fastgpt/service/support/user/team/utils', () => ({
  getRunningUserInfoByTmbId: mocks.getRunningUserInfoByTmbId
}));

vi.mock('@fastgpt/service/support/wallet/usage/controller', () => ({
  createChatUsageRecord: mocks.createChatUsageRecord
}));

vi.mock('@fastgpt/global/common/string/tools', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/global/common/string/tools')>()),
  getNanoid: mocks.getNanoid
}));

vi.mock('@fastgpt/service/common/middle/i18n', () => ({
  getLocale: () => 'zh-CN'
}));

vi.mock('@/service/core/workflow/nodeResponse', () => ({
  composeDebugNodeResponseMap: mocks.composeDebugNodeResponseMap,
  getWorkflowFinalResponseData: mocks.getWorkflowFinalResponseData
}));

import handler from '@/pages/api/core/workflow/debug';

const appId = '68ad85a7463006c963799a05';
const app = {
  _id: appId,
  name: 'Workflow app',
  teamId: '68ad85a7463006c963799a06',
  tmbId: 'owner-id'
};
const savedChatConfig = { variables: [] };

describe('workflow debug API chatId', () => {
  it('restores a masked proxy only after app authentication and masks resumed debug state', async () => {
    const stored = {
      nodeId: 'http',
      name: 'HTTP',
      flowNodeType: FlowNodeTypeEnum.httpRequest468,
      inputs: [
        {
          key: NodeInputKeyEnum.httpProxy,
          value: encryptSecretValue({ value: 'http://user:private@proxy.example.com' })
        }
      ],
      outputs: []
    };
    const requestNode = structuredClone(stored);
    requestNode.inputs[0].value = { secret: HTTP_PROXY_CONFIGURED };
    mocks.getAppDraftWorkflow.mockResolvedValue({ nodes: [stored], chatConfig: savedChatConfig });
    mocks.dispatchWorkFlow.mockImplementationOnce(async ({ runtimeNodes }) => {
      expect(runtimeNodes[0].inputs[0].value).toEqual(stored.inputs[0].value);
      return {
        debugResponse: {
          memoryEdges: [],
          memoryNodes: runtimeNodes,
          entryNodeIds: [],
          nodeResponses: {}
        },
        newVariables: {},
        flatNodeResponses: []
      };
    });
    const result = await handler(
      {
        body: { appId, nodes: [requestNode], usageId: 'usage', chatConfig: savedChatConfig },
        headers: {}
      } as any,
      {} as any
    );
    expect(result.memoryNodes[0].inputs[0].value).toEqual({ secret: HTTP_PROXY_CONFIGURED });
    expect(JSON.stringify(result)).not.toContain(JSON.stringify(stored.inputs[0].value));
    expect(mocks.authApp.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.getAppDraftWorkflow.mock.invocationCallOrder[0]
    );
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authCert.mockResolvedValue({ tmbId: 'member-id' });
    mocks.authApp.mockResolvedValue({ app });
    mocks.getAppDraftWorkflow.mockResolvedValue({
      nodes: [],
      edges: [],
      chatConfig: savedChatConfig,
      resources: []
    });
    mocks.getAppDraftVersion.mockResolvedValue({ resources: [] });
    mocks.prepareAppWorkflowResources.mockResolvedValue([]);
    mocks.getRunningUserInfoByTmbId.mockResolvedValue({
      teamId: 'team-id',
      tmbId: 'member-id'
    });
    mocks.prepareWorkflowFileQuery.mockResolvedValue({
      query: [],
      maxFileAmount: 10,
      maxBytesPerFile: 1024
    });
    mocks.dispatchWorkFlow.mockResolvedValue({
      debugResponse: {
        memoryEdges: [],
        memoryNodes: [],
        entryNodeIds: [],
        nodeResponses: {}
      },
      newVariables: {},
      flatNodeResponses: []
    });
    mocks.getWorkflowFinalResponseData.mockReturnValue([]);
    mocks.composeDebugNodeResponseMap.mockReturnValue({});
  });

  it('passes the upload session chatId to workflow dispatch', async () => {
    mocks.getNanoid.mockReturnValue('response-chat-item-id');

    await handler(
      {
        body: {
          appId,
          usageId: 'usage-id',
          chatId: 'debug-session-chat-id'
        },
        headers: { origin: 'https://fastgpt.example.com' }
      } as any,
      {} as any
    );

    expect(mocks.dispatchWorkFlow).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: 'debug-session-chat-id',
        responseChatItemId: 'response-chat-item-id',
        usageId: 'usage-id'
      })
    );
    // 执行预算由 dispatchWorkFlow 从当前实例读取，HTTP 入口不得覆盖。
    expect(mocks.dispatchWorkFlow.mock.lastCall?.[0]).not.toHaveProperty('maxRunTimes');
    expect(mocks.createChatUsageRecord).not.toHaveBeenCalled();
    expect(mocks.getNanoid).toHaveBeenCalledTimes(1);
    expect(mocks.getAppDraftWorkflow).toHaveBeenCalledWith(appId, app);
    expect(mocks.prepareWorkflowFileQuery).toHaveBeenCalledWith(
      expect.objectContaining({ chatConfig: savedChatConfig })
    );
  });

  it('generates a dispatch chatId when an older client does not provide one', async () => {
    mocks.getNanoid
      .mockReturnValueOnce('response-chat-item-id')
      .mockReturnValueOnce('generated-debug-chat-id');
    mocks.createChatUsageRecord.mockResolvedValue('generated-usage-id');

    await handler(
      {
        body: { appId },
        headers: {}
      } as any,
      {} as any
    );

    expect(mocks.dispatchWorkFlow).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: 'generated-debug-chat-id',
        responseChatItemId: 'response-chat-item-id',
        usageId: 'generated-usage-id'
      })
    );
    expect(mocks.createChatUsageRecord).toHaveBeenCalledTimes(1);
    expect(mocks.getNanoid).toHaveBeenCalledTimes(2);
    expect(mocks.getAppDraftWorkflow).toHaveBeenCalledWith(appId, app);
    expect(mocks.dispatchWorkFlow).toHaveBeenCalledWith(
      expect.objectContaining({ chatConfig: savedChatConfig })
    );
  });

  it('uses request chatConfig without loading the draft workflow', async () => {
    const requestChatConfig = { variables: [] };
    mocks.getNanoid.mockReturnValue('response-chat-item-id');

    await handler(
      {
        body: { appId, chatConfig: requestChatConfig, usageId: 'usage-id' },
        headers: {}
      } as any,
      {} as any
    );

    expect(mocks.getAppDraftWorkflow).not.toHaveBeenCalled();
    expect(mocks.prepareWorkflowFileQuery).toHaveBeenCalledWith(
      expect.objectContaining({ chatConfig: requestChatConfig })
    );
    expect(mocks.dispatchWorkFlow).toHaveBeenCalledWith(
      expect.objectContaining({ chatConfig: requestChatConfig })
    );
  });

  it('preserves client runtime edge statuses when calling workflow dispatch', async () => {
    const requestEdges = [
      {
        source: 'workflowStartNodeId',
        sourceHandle: 'workflowStartNodeId-source-right',
        target: 'aiChatNodeId',
        targetHandle: 'aiChatNodeId-target-left',
        status: 'active'
      },
      {
        source: 'aiChatNodeId',
        sourceHandle: 'aiChatNodeId-source-right',
        target: 'docParserNodeId',
        targetHandle: 'docParserNodeId-target-left',
        status: 'waiting'
      }
    ];

    await handler(
      {
        body: {
          appId,
          edges: requestEdges,
          usageId: 'usage-id'
        },
        headers: {}
      } as any,
      {} as any
    );

    expect(mocks.dispatchWorkFlow).toHaveBeenCalledWith(
      expect.objectContaining({
        runtimeEdges: requestEdges
      })
    );
  });
});
