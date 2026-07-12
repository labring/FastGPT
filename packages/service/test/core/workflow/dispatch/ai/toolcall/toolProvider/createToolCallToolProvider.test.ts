import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { createToolCallToolProvider } from '@fastgpt/service/core/workflow/dispatch/ai/toolcall/toolProvider';
import { describe, expect, it, vi } from 'vitest';

const { runWorkflowMock } = vi.hoisted(() => ({
  runWorkflowMock: vi.fn()
}));

vi.mock('@fastgpt/service/core/workflow/dispatch', () => ({
  runWorkflow: runWorkflowMock
}));

const createToolNode = (overrides: Record<string, any> = {}) =>
  ({
    nodeId: 'search',
    name: 'Search',
    avatar: 'tool-avatar',
    flowNodeType: FlowNodeTypeEnum.tool,
    intro: 'Search intro',
    toolDescription: 'Search data',
    toolParams: [],
    ...overrides
  }) as any;

const createProvider = (overrides: Record<string, any> = {}) =>
  createToolCallToolProvider({
    messages: [
      {
        role: ChatCompletionRequestMessageRoleEnum.User,
        content: 'hello'
      }
    ],
    toolNodes: [createToolNode()],
    useAgentSandbox: false,
    lang: 'en' as any,
    workflowProps: {
      runningAppInfo: {
        id: 'app_1'
      },
      uid: 'user_1',
      chatId: 'chat_1',
      runningUserInfo: {
        teamId: 'team_1',
        tmbId: 'tmb_1'
      },
      chatConfig: {},
      usageId: 'usage_1'
    } as any,
    runtimeNodes: [
      {
        nodeId: 'search',
        inputs: [
          {
            key: 'q',
            value: ''
          }
        ]
      }
    ] as any,
    runtimeEdges: [
      {
        target: 'search'
      }
    ] as any,
    allFiles: new Map(),
    fileUrlList: undefined,
    cacheToolFlowResponse: vi.fn(),
    ...overrides
  });

describe('createToolCallToolProvider', () => {
  it('exposes ToolCall runtime tools and tool info through the core provider protocol', async () => {
    const provider = await createProvider({
      toolNodes: [
        createToolNode({
          nodeId: 'dataset_node',
          flowNodeType: FlowNodeTypeEnum.datasetSearchNode
        }),
        createToolNode()
      ]
    });

    expect(provider.finalMessages).toEqual([
      {
        role: ChatCompletionRequestMessageRoleEnum.User,
        content: 'hello'
      }
    ]);
    expect(provider.buildRuntimeTools().map((tool) => tool.function.name)).toEqual(['search']);
    expect(provider.getToolInfo('search')).toEqual({
      type: 'user',
      name: 'Search',
      avatar: 'tool-avatar',
      rawData: expect.objectContaining({
        nodeId: 'search'
      })
    });
  });

  it('executes workflow tools through the provider', async () => {
    const cacheToolFlowResponse = vi.fn();
    runWorkflowMock.mockResolvedValue({
      toolResponse: {
        answer: 'workflow ok'
      },
      assistantResponses: [{ text: { content: 'assistant text' } }],
      flowUsages: [{ moduleName: 'tool', totalPoints: 1 }],
      flatNodeResponses: [
        {
          id: 'search',
          nodeId: 'search',
          moduleName: 'Search'
        }
      ],
      runtimeNodeResponseSummary: { hasToolStop: false, runningTime: 0 },
      workflowInteractiveResponse: undefined
    });

    const provider = await createProvider({
      cacheToolFlowResponse
    });
    const result = await provider.executeTool({
      call: {
        id: 'call_search',
        type: 'function',
        function: {
          name: 'search',
          arguments: '{"q":"FastGPT"}'
        }
      } as any,
      messages: []
    });

    expect(result).toEqual(
      expect.objectContaining({
        response: JSON.stringify({ answer: 'workflow ok' }, null, 2),
        usages: [{ moduleName: 'tool', totalPoints: 1 }],
        stop: false
      })
    );
    expect(cacheToolFlowResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        callId: 'call_search',
        flowResponse: expect.objectContaining({
          flowResponses: [
            {
              id: 'search',
              nodeId: 'search',
              moduleName: 'Search'
            }
          ],
          flowUsages: [{ moduleName: 'tool', totalPoints: 1 }]
        })
      })
    );
  });

  it('creates dataset search system executor from dataset search tool node', async () => {
    runWorkflowMock.mockResolvedValue({
      toolResponse: 'dataset ok',
      assistantResponses: [],
      flowUsages: [{ moduleName: 'Dataset search', totalPoints: 2 }],
      flatNodeResponses: [
        {
          id: 'dataset_node',
          nodeId: 'dataset_node',
          moduleType: FlowNodeTypeEnum.datasetSearchNode,
          moduleName: 'Dataset search'
        }
      ],
      runtimeNodeResponseSummary: { hasToolStop: false, runningTime: 0 },
      workflowInteractiveResponse: undefined
    });
    const runtimeNodes = [
      {
        nodeId: 'dataset_node',
        inputs: [
          {
            key: NodeInputKeyEnum.datasetSearchInput,
            value: []
          }
        ]
      }
    ] as any;
    const runtimeEdges = [
      {
        target: 'dataset_node'
      }
    ] as any;
    const provider = await createProvider({
      toolNodes: [
        createToolNode({
          nodeId: 'dataset_node',
          flowNodeType: FlowNodeTypeEnum.datasetSearchNode
        })
      ],
      runtimeNodes,
      runtimeEdges
    });

    expect(provider.datasetSearchExecutor).toBeDefined();

    const result = await provider.datasetSearchExecutor!({
      messages: [],
      call: {
        id: 'call_dataset',
        type: 'function',
        function: {
          name: 'dataset_search',
          arguments: JSON.stringify({
            query: ['FastGPT']
          })
        }
      } as any
    });

    expect(runtimeNodes[0]).toEqual(
      expect.objectContaining({
        isEntry: true,
        inputs: [
          {
            key: NodeInputKeyEnum.datasetSearchInput,
            value: ['FastGPT']
          }
        ]
      })
    );
    expect(runtimeEdges[0]).toEqual({
      target: 'dataset_node',
      status: 'active'
    });
    expect(runWorkflowMock).toHaveBeenCalledWith(
      expect.objectContaining({
        runtimeNodes,
        runtimeEdges,
        isToolCall: true
      })
    );
    expect(result).toEqual(
      expect.objectContaining({
        response: 'dataset ok',
        usages: [{ moduleName: 'Dataset search', totalPoints: 2 }],
        metadata: expect.objectContaining({
          id: 'call_dataset',
          nodeId: 'call_dataset',
          moduleName: 'Dataset search',
          moduleType: FlowNodeTypeEnum.datasetSearchNode,
          totalPoints: 2
        })
      })
    );
  });

  it('creates read file system executor from toolcall file context', async () => {
    const provider = await createProvider({
      allFiles: new Map([
        [
          'file_1',
          {
            id: 'file_1',
            name: 'a.pdf',
            url: 'https://files/a.pdf'
          }
        ]
      ])
    });

    expect(provider.readFileExecutor).toBeDefined();
  });
});
