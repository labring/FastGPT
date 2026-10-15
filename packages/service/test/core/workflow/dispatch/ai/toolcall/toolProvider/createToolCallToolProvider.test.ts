import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { createToolCallToolProvider } from '@fastgpt/service/core/workflow/dispatch/ai/toolcall/toolProvider/createToolCallToolProvider';
import { getWorkflowContext } from '@fastgpt/service/core/workflow/dispatch/context';
import { WorkflowVariableState } from '@fastgpt/service/core/workflow/dispatch/context/variables';
import { runWithTestWorkflowContext as runWithContext } from '@fastgpt/service/test/core/workflow/dispatch/context/fixtures';
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

const createProvider = (overrides: Record<string, any> = {}) => {
  const { variableContext, checkIsStopping = () => false, ...providerOverrides } = overrides;
  return runWithContext(
    {
      checkIsStopping,
      mcpClientMemory: {},
      variableContext,
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
        ...providerOverrides
      })
  );
};

const createVariableContext = async (values: Record<string, unknown>) => {
  const context = await WorkflowVariableState.create({
    timezone: 'Asia/Shanghai',
    runningAppInfo: {
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'app_1',
      teamId: 'team_1',
      tmbId: 'tmb_1',
      name: 'App'
    },
    uid: 'user_1',
    chatId: 'chat_1',
    variablesConfig: []
  });
  for (const [key, value] of Object.entries(values)) await context.set(key, value);
  return context;
};

const createCall = (id: string) =>
  ({ id, type: 'function', function: { name: 'search', arguments: '{}' } }) as const;

const createWorkflowResponse = (overrides: Record<string, unknown> = {}) => ({
  flatNodeResponses: [],
  flowUsages: [],
  assistantResponses: [],
  toolResponse: 'ok',
  workflowRuntimeSummary: { hasError: false, hasToolStop: false, runningTime: 0 },
  ...overrides
});

describe('createToolCallToolProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runWorkflowMock.mockReset();
  });

  it.each(['call', 'resume'] as const)(
    'isolates variable values and commits only changed keys after a successful %s',
    async (mode) => {
      const parent = await createVariableContext({
        changed: 1,
        unchanged: 'before',
        nested: { items: [1] }
      });
      runWorkflowMock.mockImplementation(async () => {
        expect(getWorkflowContext().runtimeControl.isToolCall).toBe(true);
        const child = getWorkflowContext().variableContext;
        expect(child).not.toBe(parent);
        await child.set('changed', 0);
        await child.set('added', false);
        (child.get('nested') as { items: number[] }).items.push(2);
        expect(parent.get('changed')).toBe(1);
        expect(parent.get('nested')).toEqual({ items: [1] });
        // 未修改的旧快照不能覆盖执行期间父级已经发生的变更。
        await parent.set('unchanged', 'parent update');
        return createWorkflowResponse();
      });
      const provider = await createProvider({ variableContext: parent });
      const parentSet = vi.spyOn(parent, 'set');
      if (mode === 'call') {
        await provider.executeTool({ call: createCall('success'), messages: [] });
      } else {
        await provider.executeInteractiveTool!({
          childrenResponse: { entryNodeIds: ['search'] },
          toolParams: { toolCallId: 'success' }
        } as any);
      }
      expect(parent.toStoreRecord()).toEqual({
        changed: 0,
        unchanged: 'parent update',
        nested: { items: [1, 2] },
        added: false
      });
      expect(parentSet.mock.calls.filter(([key]) => key === 'unchanged')).toEqual([
        ['unchanged', 'parent update']
      ]);
    }
  );

  it.each(['error', 'throw', 'pause', 'stop'] as const)(
    'discards variable changes on %s without affecting the next call',
    async (outcome) => {
      const parent = await createVariableContext({ count: 1, nested: { items: [1] } });
      let stopping = false;
      runWorkflowMock.mockImplementationOnce(async () => {
        const child = getWorkflowContext().variableContext;
        await child.set('count', 2);
        (child.get('nested') as { items: number[] }).items.push(2);
        if (outcome === 'throw') throw new Error('tool failed');
        if (outcome === 'stop') stopping = true;
        return createWorkflowResponse({
          ...(outcome === 'error'
            ? { workflowRuntimeSummary: { hasError: true, errorText: 'tool failed' } }
            : {}),
          ...(outcome === 'pause'
            ? { workflowInteractiveResponse: { entryNodeIds: ['search'] } }
            : {})
        });
      });
      const provider = await createProvider({
        variableContext: parent,
        checkIsStopping: () => stopping
      });
      const first = provider.executeTool({ call: createCall('failed'), messages: [] });
      if (outcome === 'throw') await expect(first).rejects.toThrow('tool failed');
      else await first;
      expect(parent.toStoreRecord()).toEqual({ count: 1, nested: { items: [1] } });

      stopping = false;
      runWorkflowMock.mockImplementationOnce(async () => {
        await getWorkflowContext().variableContext.set('count', 3);
        return createWorkflowResponse();
      });
      await provider.executeTool({ call: createCall('next'), messages: [] });
      expect(parent.get('count')).toBe(3);
    }
  );

  it('commits variable deltas as each concurrent tool completes, without waiting for invocation order', async () => {
    const parent = await createVariableContext({ shared: 0, firstOnly: 0, secondOnly: 0 });
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const children: unknown[] = [];
    runWorkflowMock
      .mockImplementationOnce(async () => {
        const child = getWorkflowContext().variableContext;
        children.push(child);
        await child.set('shared', 1);
        await child.set('firstOnly', 1);
        await firstGate;
        return createWorkflowResponse();
      })
      .mockImplementationOnce(async () => {
        const child = getWorkflowContext().variableContext;
        children.push(child);
        expect(child.get('shared')).toBe(0);
        await child.set('shared', 2);
        await child.set('secondOnly', 2);
        return createWorkflowResponse();
      });
    const provider = await createProvider({ variableContext: parent });
    const parentSet = vi.spyOn(parent, 'set');
    const first = provider.executeTool({ call: createCall('first'), messages: [] });
    const second = provider.executeTool({ call: createCall('second'), messages: [] });
    try {
      await second;
      expect(children[0]).not.toBe(children[1]);
      expect(parent.toStoreRecord()).toEqual({ shared: 2, firstOnly: 0, secondOnly: 2 });
      expect(parentSet.mock.calls).toEqual([
        ['shared', 2],
        ['secondOnly', 2]
      ]);
    } finally {
      releaseFirst();
    }
    await Promise.all([first, second]);
    expect(parent.toStoreRecord()).toEqual({ shared: 1, firstOnly: 1, secondOnly: 2 });
    expect(parentSet.mock.calls).toEqual([
      ['shared', 2],
      ['secondOnly', 2],
      ['shared', 1],
      ['firstOnly', 1]
    ]);
  });

  it('commits a completed concurrent call before an earlier pending call throws', async () => {
    const parent = await createVariableContext({ shared: 0 });
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    runWorkflowMock
      .mockImplementationOnce(async () => {
        await getWorkflowContext().variableContext.set('shared', 1);
        await firstGate;
        throw new Error('first failed');
      })
      .mockImplementationOnce(async () => {
        await getWorkflowContext().variableContext.set('shared', 2);
        return createWorkflowResponse();
      });
    const provider = await createProvider({ variableContext: parent });
    const first = provider.executeTool({ call: createCall('first'), messages: [] });
    const firstFailed = expect(first).rejects.toThrow('first failed');
    const second = provider.executeTool({ call: createCall('second'), messages: [] });
    try {
      await second;
      expect(parent.get('shared')).toBe(2);
    } finally {
      releaseFirst();
    }
    await Promise.all([firstFailed, second]);
    expect(parent.get('shared')).toBe(2);
  });

  it('allows the next call to commit after writing back a variable fails', async () => {
    const parent = await createVariableContext({ count: 0 });
    const parentSet = vi.spyOn(parent, 'set').mockRejectedValueOnce(new Error('commit failed'));
    runWorkflowMock.mockImplementation(async () => {
      await getWorkflowContext().variableContext.set('count', 1);
      return createWorkflowResponse();
    });
    const provider = await createProvider({ variableContext: parent });
    await expect(provider.executeTool({ call: createCall('first'), messages: [] })).rejects.toThrow(
      'commit failed'
    );
    expect(parent.get('count')).toBe(0);
    await provider.executeTool({ call: createCall('next'), messages: [] });
    expect(parent.get('count')).toBe(1);
    expect(parentSet).toHaveBeenCalledTimes(2);
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
        toolParams: { toolCallId: 'call_search' }
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
});
