import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { createToolCallToolProvider } from '@fastgpt/service/core/workflow/dispatch/ai/toolcall/toolProvider';
import { runWithContext } from '@fastgpt/service/core/workflow/utils/context';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    inputs: [
      {
        key: 'q',
        renderTypeList: [FlowNodeInputTypeEnum.agentGenerated],
        selectedType: FlowNodeInputTypeEnum.agentGenerated
      }
    ],
    ...overrides
  }) as any;

const createProvider = (overrides: Record<string, any> = {}) =>
  runWithContext(
    {
      mcpClientMemory: {},
      fileContext: {
        limits: { maxFileAmount: 20, maxBytesPerFile: 1024 }
      } as any
    },
    () =>
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
                value: '',
                renderTypeList: [FlowNodeInputTypeEnum.agentGenerated],
                selectedType: FlowNodeInputTypeEnum.agentGenerated
              }
            ]
          }
        ] as any,
        runtimeEdges: [
          {
            target: 'search'
          }
        ] as any,
        cacheToolFlowResponse: vi.fn(),
        ...overrides
      })
  );

describe('createToolCallToolProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runWorkflowMock.mockReset();
  });

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

  it.each([true, false])(
    'inherits parent stream=%s when executing workflow tools',
    async (stream) => {
      const cacheToolFlowResponse = vi.fn();
      const workflowStreamResponse = vi.fn();
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
        workflowRuntimeSummary: { hasToolStop: false, runningTime: 0 },
        workflowInteractiveResponse: undefined
      });

      const provider = await createProvider({
        cacheToolFlowResponse,
        workflowProps: {
          runningAppInfo: { id: 'app_1' },
          runningUserInfo: { teamId: 'team_1', tmbId: 'tmb_1' },
          uid: 'user_1',
          chatId: 'chat_1',
          chatConfig: {},
          usageId: 'usage_1',
          nodeResponseParentId: 'toolcall_response',
          stream,
          workflowStreamResponse: stream ? workflowStreamResponse : undefined
        } as any
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
      expect(runWorkflowMock).toHaveBeenCalledWith(
        expect.objectContaining({
          stream,
          nodeResponseParentId: 'toolcall_response',
          workflowStreamResponse: stream ? workflowStreamResponse : undefined
        })
      );
      expect(workflowStreamResponse).not.toHaveBeenCalled();

      // 子流程暂停后恢复也必须继承同一流式设置，不能在恢复入口重新禁流。
      const childrenResponse = { type: 'userInput', entryNodeIds: ['search'] };
      runWorkflowMock.mockClear();
      await provider.executeInteractiveTool!({
        childrenResponse,
        toolCallId: 'call_search'
      } as any);
      expect(runWorkflowMock).toHaveBeenCalledWith(
        expect.objectContaining({
          stream,
          nodeResponseParentId: 'toolcall_response',
          workflowStreamResponse: stream ? workflowStreamResponse : undefined,
          lastInteractive: childrenResponse
        })
      );
    }
  );

  it('runs every connected dataset search node and merges their citations', async () => {
    runWorkflowMock.mockImplementation(async ({ runtimeNodes }) => {
      const entryNode = runtimeNodes.find((node: any) => node.isEntry);
      const index = entryNode.nodeId.endsWith('_1') ? 1 : 2;

      return {
        toolResponse: {
          prompt: 'Use the citations',
          cites: [
            {
              id: `quote_${index}`,
              sourceName: `Dataset ${index}`,
              content: `Answer ${index}`
            }
          ]
        },
        assistantResponses: [],
        flowUsages: [{ moduleName: `Dataset search ${index}`, totalPoints: 1 }],
        flatNodeResponses: [
          {
            id: entryNode.nodeId,
            nodeId: entryNode.nodeId,
            moduleType: FlowNodeTypeEnum.datasetSearchNode,
            moduleName: `Dataset search ${index}`
          }
        ],
        runTimes: 1,
        workflowRuntimeSummary: { hasToolStop: false, runningTime: 0 },
        workflowInteractiveResponse: undefined
      };
    });
    const runtimeNodes = [
      {
        nodeId: 'dataset_node_1',
        inputs: [
          {
            key: NodeInputKeyEnum.datasetSearchInput,
            value: []
          }
        ]
      },
      {
        nodeId: 'dataset_node_2',
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
        target: 'dataset_node_1'
      },
      {
        target: 'dataset_node_2'
      }
    ] as any;
    const cacheToolFlowResponse = vi.fn();
    const provider = await createProvider({
      toolNodes: [
        createToolNode({
          nodeId: 'dataset_node_1',
          flowNodeType: FlowNodeTypeEnum.datasetSearchNode
        }),
        createToolNode({
          nodeId: 'dataset_node_2',
          flowNodeType: FlowNodeTypeEnum.datasetSearchNode
        })
      ],
      runtimeNodes,
      runtimeEdges,
      cacheToolFlowResponse
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

    expect(runWorkflowMock).toHaveBeenCalledTimes(2);
    expect(
      runWorkflowMock.mock.calls.map(([call]) => ({
        entryNode: call.runtimeNodes.find((node: any) => node.isEntry),
        activeEdge: call.runtimeEdges.find((edge: any) => edge.status === 'active')
      }))
    ).toEqual([
      {
        entryNode: expect.objectContaining({
          nodeId: 'dataset_node_1',
          inputs: [
            {
              key: NodeInputKeyEnum.datasetSearchInput,
              value: ['FastGPT']
            }
          ]
        }),
        activeEdge: expect.objectContaining({ target: 'dataset_node_1' })
      },
      {
        entryNode: expect.objectContaining({
          nodeId: 'dataset_node_2',
          inputs: [
            {
              key: NodeInputKeyEnum.datasetSearchInput,
              value: ['FastGPT']
            }
          ]
        }),
        activeEdge: expect.objectContaining({ target: 'dataset_node_2' })
      }
    ]);
    expect(result).toEqual(
      expect.objectContaining({
        response: expect.stringContaining('quote_1'),
        usages: [
          { moduleName: 'Dataset search 1', totalPoints: 1 },
          { moduleName: 'Dataset search 2', totalPoints: 1 }
        ],
        metadata: expect.objectContaining({
          id: 'call_dataset',
          nodeId: 'call_dataset',
          moduleName: 'Dataset search 1',
          moduleType: FlowNodeTypeEnum.datasetSearchNode,
          childrenResponses: expect.arrayContaining([
            expect.objectContaining({
              nodeId: 'dataset_node_2',
              moduleName: 'Dataset search 2'
            })
          ]),
          totalPoints: 2
        })
      })
    );
    expect(result.response).toContain('quote_2');
    expect(cacheToolFlowResponse).toHaveBeenCalledWith({
      callId: 'call_dataset',
      flowResponse: expect.objectContaining({
        runTimes: 2,
        flowResponses: expect.arrayContaining([
          expect.objectContaining({ nodeId: 'dataset_node_1' }),
          expect.objectContaining({ nodeId: 'dataset_node_2' })
        ])
      })
    });
  });

  it('always creates the direct-URL read file system executor', async () => {
    const provider = await createProvider();

    expect(provider.readFileExecutor).toBeDefined();
  });

  it('forks memoryState and merges child system_memories for parallel dataset_search and user tools', async () => {
    const { WorkflowMemoryState } =
      await import('@fastgpt/service/core/workflow/dispatch/utils/memories');
    const parentMemoryState = WorkflowMemoryState.fromRecord({
      'app:app_1:rootExtract': { memory: 'baseline' }
    }).fork('node:toolCall1');

    runWorkflowMock.mockImplementation(async ({ runtimeNodes, memoryState }) => {
      const entryNode = runtimeNodes.find((node: any) => node.isEntry);
      const key = memoryState.getNodeMemoryKey({
        runningAppInfo: { sourceType: 'app', sourceId: 'app_1' },
        nodeId: entryNode.nodeId
      });
      return {
        toolResponse: {
          prompt: 'Use citations',
          cites: []
        },
        assistantResponses: [],
        flowUsages: [],
        flatNodeResponses: [],
        runTimes: 1,
        system_memories: {
          [key]: {
            memory: `ok-${entryNode.nodeId}`
          }
        },
        workflowRuntimeSummary: { hasToolStop: false, runningTime: 0 },
        workflowInteractiveResponse: undefined
      };
    });

    const provider = await createProvider({
      workflowProps: {
        node: { nodeId: 'toolCall1' },
        memoryState: parentMemoryState,
        runningAppInfo: { id: 'app_1', sourceType: 'app', sourceId: 'app_1' },
        runningUserInfo: { teamId: 'team_1', tmbId: 'tmb_1' },
        uid: 'user_1',
        chatId: 'chat_1',
        chatConfig: {},
        usageId: 'usage_1'
      } as any,
      toolNodes: [
        createToolNode({
          nodeId: 'dataset_node_1',
          flowNodeType: FlowNodeTypeEnum.datasetSearchNode
        }),
        createToolNode({
          nodeId: 'dataset_node_2',
          flowNodeType: FlowNodeTypeEnum.datasetSearchNode
        }),
        createToolNode({
          nodeId: 'search'
        })
      ],
      runtimeNodes: [
        {
          nodeId: 'dataset_node_1',
          inputs: [{ key: NodeInputKeyEnum.datasetSearchInput, value: [] }]
        },
        {
          nodeId: 'dataset_node_2',
          inputs: [{ key: NodeInputKeyEnum.datasetSearchInput, value: [] }]
        },
        {
          nodeId: 'search',
          inputs: [
            {
              key: 'q',
              value: '',
              renderTypeList: [FlowNodeInputTypeEnum.agentGenerated],
              selectedType: FlowNodeInputTypeEnum.agentGenerated
            }
          ]
        }
      ] as any,
      runtimeEdges: [
        { target: 'dataset_node_1' },
        { target: 'dataset_node_2' },
        { target: 'search' }
      ] as any
    });

    await provider.datasetSearchExecutor!({
      messages: [],
      call: {
        id: 'call_dataset',
        type: 'function',
        function: {
          name: 'dataset_search',
          arguments: JSON.stringify({ query: ['FastGPT'] })
        }
      } as any
    });

    await provider.executeTool({
      messages: [],
      call: {
        id: 'call_search',
        type: 'function',
        function: {
          name: 'search',
          arguments: JSON.stringify({ q: 'FastGPT' })
        }
      } as any
    });

    expect(parentMemoryState.getDelta()).toEqual({
      'node:toolCall1/app:app_1:dataset_node_1': {
        memory: 'ok-dataset_node_1'
      },
      'node:toolCall1/app:app_1:dataset_node_2': {
        memory: 'ok-dataset_node_2'
      },
      'node:toolCall1/app:app_1:search': {
        memory: 'ok-search'
      }
    });
  });
});
