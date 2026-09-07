import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';

const mocks = vi.hoisted(() => ({
  authApp: vi.fn(),
  authCert: vi.fn(),
  composeDebugNodeResponseMap: vi.fn(),
  createChatUsageRecord: vi.fn(),
  dispatchWorkFlow: vi.fn(),
  getNanoid: vi.fn(),
  getRunningUserInfoByTmbId: vi.fn(),
  getWorkflowFinalResponseData: vi.fn(),
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
  teamId: 'team-id',
  tmbId: 'owner-id',
  chatConfig: { variables: [] }
};

describe('workflow debug API chatId', () => {
  it('preserves Agent variable references in the debug response', async () => {
    const node = {
      nodeId: 'agent',
      name: 'Agent',
      flowNodeType: 'agent',
      isEntry: true,
      inputs: [
        {
          key: NodeInputKeyEnum.selectedTools,
          label: 'Tools',
          renderTypeList: ['reference'],
          value: ['source-node', 'tools']
        }
      ],
      outputs: []
    };
    mocks.dispatchWorkFlow.mockResolvedValue({
      debugResponse: { memoryNodes: [node], memoryEdges: [], entryNodeIds: [], nodeResponses: {} },
      newVariables: {},
      flatNodeResponses: []
    });
    const response = await handler(
      { body: { appId, usageId: 'usage-id', nodes: [node] }, headers: {} } as any,
      {} as any
    );
    expect(response.memoryNodes[0]).toEqual(node);
    expect(mocks.dispatchWorkFlow.mock.calls[0][0].runtimeNodes[0]).toEqual(node);
  });

  it('preserves non-tool runtime extensions', async () => {
    const node = {
      nodeId: 'code',
      name: 'Code',
      flowNodeType: 'code',
      inputs: [],
      outputs: [],
      isEntry: true,
      opaqueRuntimeState: { index: 2 }
    };
    mocks.dispatchWorkFlow.mockResolvedValue({
      debugResponse: {
        memoryNodes: [node],
        memoryEdges: [],
        entryNodeIds: ['code'],
        nodeResponses: {}
      },
      newVariables: {},
      flatNodeResponses: []
    });
    const response = await handler(
      { body: { appId, usageId: 'usage-id', nodes: [node] }, headers: {} } as any,
      {} as any
    );
    expect(response.memoryNodes[0]).toEqual(node);
    expect(mocks.dispatchWorkFlow.mock.calls[0][0].runtimeNodes[0]).toEqual(node);
  });

  it.each([
    ['mcp', false],
    ['http', false],
    ['mcp', true],
    ['http', true]
  ] as const)(
    'keeps %s single-step state (toolset: %s) without round-tripping execution schemas',
    async (source, isToolSet) => {
      const toolId = `${source}-507f1f77bcf86cd799439011/search`;
      const toolKey = source === 'mcp' ? 'mcpTool' : 'httpTool';
      const setKey = source === 'mcp' ? 'mcpToolSet' : 'httpToolSet';
      const businessValue = { requestSchema: 'business-data' };
      const node = {
        nodeId: 'tool',
        name: 'Search',
        flowNodeType: isToolSet ? 'toolSet' : 'tool',
        pluginId: isToolSet ? '507f1f77bcf86cd799439011' : undefined,
        isEntry: true,
        catchError: true,
        jsonSchema: { type: 'object', properties: { query: { type: 'string' } } },
        toolConfig: {
          ...(!isToolSet ? { [toolKey]: { toolId } } : {}),
          [setKey]: {
            url: 'https://private.example.com',
            toolList: [],
            ...(isToolSet ? { toolId: '' } : {})
          }
        },
        inputs: [
          {
            key: 'query',
            label: 'Query',
            renderTypeList: ['input'],
            value: businessValue,
            customJsonSchema: { type: 'object' }
          }
        ],
        outputs: [
          { id: 'result', key: 'result', label: 'Result', type: 'static', value: businessValue }
        ],
        opaqueRuntimeState: { step: 3 }
      };
      const agent = {
        nodeId: 'agent',
        name: 'Agent',
        flowNodeType: 'agent',
        isEntry: false,
        outputs: [],
        inputs: [
          {
            key: NodeInputKeyEnum.selectedTools,
            label: 'Tools',
            renderTypeList: ['selectTool'],
            value: [
              {
                id: '507f1f77bcf86cd799439011',
                config: { payload: businessValue },
                toolConfig: { [setKey]: { url: 'https://private.example.com', toolList: [] } }
              }
            ]
          }
        ]
      };
      const original = structuredClone([node, agent]);
      mocks.dispatchWorkFlow.mockResolvedValue({
        debugResponse: {
          memoryNodes: [node, agent],
          memoryEdges: [],
          entryNodeIds: ['tool'],
          nodeResponses: {},
          skipNodeQueue: [{ id: 'skip', skippedNodeIdList: ['tool'] }]
        },
        newVariables: { saved: businessValue },
        flatNodeResponses: []
      });
      const response = await handler(
        {
          body: { appId, usageId: 'usage-id', chatId: 'debug-chat', nodes: [node, agent] },
          headers: {}
        } as any,
        {} as any
      );
      const assertProjection = (projected: any[]) => {
        expect(projected[0]).not.toHaveProperty('jsonSchema');
        expect(projected[0].inputs[0]).not.toHaveProperty('customJsonSchema');
        expect(projected[0].inputs[0].value).toEqual(businessValue);
        expect(projected[0].outputs[0].value).toEqual(businessValue);
        expect(projected[0].toolConfig).toEqual(
          isToolSet
            ? { [setKey]: { toolId: '507f1f77bcf86cd799439011' } }
            : { [toolKey]: { toolId } }
        );
        expect(projected[0]).toMatchObject({
          isEntry: true,
          catchError: true,
          opaqueRuntimeState: { step: 3 }
        });
        expect(projected[1].inputs[0].value[0]).toMatchObject({
          toolConfig: { [setKey]: { toolId: '507f1f77bcf86cd799439011' } },
          config: { payload: businessValue }
        });
      };
      // 首次请求不另做清理；引擎按 toolId 重新加载定义，仅响应出口生成过滤后的副本。
      expect(mocks.dispatchWorkFlow.mock.calls[0][0].runtimeNodes).toEqual(original);
      assertProjection(response.memoryNodes);
      expect(response.skipNodeQueue).toEqual([{ id: 'skip', skippedNodeIdList: ['tool'] }]);
      expect(response.newVariables).toEqual({ saved: businessValue });
      expect([node, agent]).toEqual(original);
      await handler(
        {
          body: {
            appId,
            usageId: 'usage-id',
            chatId: 'debug-chat',
            nodes: response.memoryNodes,
            skipNodeQueue: response.skipNodeQueue
          },
          headers: {}
        } as any,
        {} as any
      );
      assertProjection(mocks.dispatchWorkFlow.mock.calls[1][0].runtimeNodes);
    }
  );

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authCert.mockResolvedValue({ tmbId: 'member-id' });
    mocks.authApp.mockResolvedValue({ app });
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
    expect(mocks.createChatUsageRecord).not.toHaveBeenCalled();
    expect(mocks.getNanoid).toHaveBeenCalledTimes(1);
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
  });
});
