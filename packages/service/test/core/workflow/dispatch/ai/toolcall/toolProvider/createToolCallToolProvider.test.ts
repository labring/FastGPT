import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import {
  NodeInputKeyEnum,
  VARIABLE_NODE_ID,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { workflowSseEvent } from '@fastgpt/global/core/workflow/runtime/sse';
import { callbackMap } from '@fastgpt/service/core/workflow/dispatch/constants';
import {
  graphNode,
  graphEdge
} from '@fastgpt/service/test/core/workflow/dispatch/testUtils/workflowGraph';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { createToolCallToolProvider } from '@fastgpt/service/core/workflow/dispatch/ai/toolcall/toolProvider/createToolCallToolProvider';
import { getWorkflowContext } from '@fastgpt/service/core/workflow/dispatch/context';
import { WorkflowVariableState } from '@fastgpt/service/core/workflow/dispatch/context/variables';
import {
  captureTestWorkflowContext,
  createTestWorkflowFileContext,
  getCapturedTestWorkflowContext,
  runWithTestWorkflowContext as runWithContext
} from '@fastgpt/service/test/core/workflow/dispatch/context/fixtures';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { runWorkflowMock } = vi.hoisted(() => ({
  runWorkflowMock: vi.fn()
}));

vi.mock('@fastgpt/service/core/workflow/dispatch', () => ({
  runWorkflow: (props: any) => runWorkflowMock(captureTestWorkflowContext(props))
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

const createProvider = async (overrides: Record<string, any> = {}) => {
  const {
    variableContext,
    memoryContext,
    checkIsStopping = () => false,
    workflowProps: workflowPropsOverrides,
    ...providerOverrides
  } = overrides;
  const { workflowStreamResponse, ...workflowProps } = workflowPropsOverrides ?? {};
  return runWithContext(
    {
      checkIsStopping,
      mcpClientMemory: {},
      variableContext,
      memoryContext,
      workflowStreamResponse,
      fileContext: await createTestWorkflowFileContext()
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
            sourceType: ChatSourceTypeEnum.app,
            sourceId: 'app_1',
            teamId: 'team_1',
            tmbId: 'tmb_1',
            name: 'App'
          },
          timezone: 'Asia/Shanghai',
          histories: [],
          query: [],
          responseChatItemId: 'response_1',
          uid: 'user_1',
          chatId: 'chat_1',
          runningUserInfo: {
            teamId: 'team_1',
            tmbId: 'tmb_1'
          },
          chatConfig: {},
          usageId: 'usage_1',
          ...workflowProps
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
  workflowRuntimeSummary: { errorCount: 0, hasToolStop: false, runningTime: 0 },
  ...overrides
});

describe('createToolCallToolProvider', () => {
  afterEach(() => vi.restoreAllMocks());
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

  it.each(['error', 'throw', 'stop'] as const)(
    'discards variable changes on %s without affecting the next call',
    async (outcome) => {
      const parent = await createVariableContext({ count: 1, nested: { items: [1] } });
      let stopping = false;
      const workflowStreamResponse = vi.fn();
      runWorkflowMock.mockImplementationOnce(async () => {
        const child = getWorkflowContext().variableContext;
        await child.set('count', 2);
        (child.get('nested') as { items: number[] }).items.push(2);
        getWorkflowContext().workflowStreamResponse?.(
          workflowSseEvent.updateVariables(child.toStoreRecord())
        );
        if (outcome === 'throw') throw new Error('tool failed');
        if (outcome === 'stop') stopping = true;
        return createWorkflowResponse({
          ...(outcome === 'error'
            ? { workflowRuntimeSummary: { errorCount: 1, errorText: 'tool failed' } }
            : {})
        });
      });
      const provider = await createProvider({
        variableContext: parent,
        checkIsStopping: () => stopping,
        workflowProps: { workflowStreamResponse }
      });
      const first = provider.executeTool({ call: createCall('failed'), messages: [] });
      if (outcome === 'throw') await expect(first).rejects.toThrow('tool failed');
      else await first;
      expect(parent.toStoreRecord()).toEqual({ count: 1, nested: { items: [1] } });
      expect(workflowStreamResponse).not.toHaveBeenCalled();

      stopping = false;
      runWorkflowMock.mockImplementationOnce(async () => {
        await getWorkflowContext().variableContext.set('count', 3);
        return createWorkflowResponse();
      });
      await provider.executeTool({ call: createCall('next'), messages: [] });
      expect(parent.get('count')).toBe(3);
    }
  );

  it.each(['form', 'select'] as const)(
    'preserves completed variable updates across a real %s pause and resume',
    async (kind) => {
      const { runWorkflow } = await vi.importActual<
        typeof import('@fastgpt/service/core/workflow/dispatch')
      >('@fastgpt/service/core/workflow/dispatch');
      runWorkflowMock.mockImplementation(runWorkflow);
      const parent = await createVariableContext({ counter: 0 });
      const update = graphNode({
        id: 'search',
        type: FlowNodeTypeEnum.variableUpdate,
        params: {
          updateList: [
            {
              variable: [VARIABLE_NODE_ID, 'counter'],
              value: ['', 42],
              valueType: WorkflowIOValueTypeEnum.number,
              renderType: FlowNodeInputTypeEnum.input
            }
          ]
        }
      });
      const pause = graphNode({
        id: 'pause',
        type: kind === 'form' ? FlowNodeTypeEnum.formInput : FlowNodeTypeEnum.userSelect,
        params:
          kind === 'form'
            ? {
                userInputForms: [
                  {
                    key: 'value',
                    label: 'value',
                    type: 'input',
                    value: '',
                    valueType: 'string',
                    required: true
                  }
                ]
              }
            : { userSelectOptions: [{ key: 'yes', value: 'YES' }] }
      });
      const answer = graphNode({
        id: 'answer',
        type: FlowNodeTypeEnum.answerNode,
        params: { text: '{{counter}}' }
      });
      const workflowStreamResponse = vi.fn();
      const providerOptions = {
        workflowProps: { workflowStreamResponse },
        variableContext: parent,
        toolNodes: [update],
        runtimeNodes: [update, pause, answer],
        runtimeEdges: [
          graphEdge({ source: 'search', target: 'pause' }),
          graphEdge({
            source: 'pause',
            target: 'answer',
            handle: kind === 'form' ? 'right' : 'yes'
          })
        ]
      };
      const provider = await createProvider(providerOptions);
      const updateNode = vi.spyOn(callbackMap, FlowNodeTypeEnum.variableUpdate);
      const paused = await provider.executeTool({ call: createCall('pause'), messages: [] });
      expect(paused.interactive).toMatchObject({ type: 'toolChildrenInteractive' });
      expect(parent.get('counter')).toBe(42);
      expect(workflowStreamResponse).toHaveBeenCalledWith(
        workflowSseEvent.updateVariables({ counter: 42 })
      );
      const resumedProvider = await createProvider({
        ...providerOptions,
        workflowProps: {
          query: [{ text: { content: kind === 'form' ? '{"value":"resume"}' : 'YES' } }]
        }
      });
      const resumed = await resumedProvider.executeInteractiveTool!({
        toolCallId: 'pause',
        childrenResponse: (paused.interactive as any).params.childrenResponse
      } as any);
      expect(resumed.interactive).toBeUndefined();
      expect(resumed.response).toContain('42');
      expect(parent.get('counter')).toBe(42);
      expect(updateNode).toHaveBeenCalledOnce();
    }
  );

  it('emits committed parent variables rather than concurrent child snapshots while forwarding other SSE events', async () => {
    const { runWorkflow } = await vi.importActual<
      typeof import('@fastgpt/service/core/workflow/dispatch')
    >('@fastgpt/service/core/workflow/dispatch');
    runWorkflowMock.mockImplementation(runWorkflow);
    const parent = await createVariableContext({ x: 0, y: 0 });
    const updates = ['x', 'y'].map((key, index) =>
      graphNode({
        id: index === 0 ? 'search' : 'other',
        type: FlowNodeTypeEnum.variableUpdate,
        params: {
          updateList: [
            {
              variable: [VARIABLE_NODE_ID, key],
              value: ['', index + 1],
              valueType: WorkflowIOValueTypeEnum.number,
              renderType: FlowNodeInputTypeEnum.input
            }
          ]
        }
      })
    );
    let releaseFirst!: () => void;
    let notifyStarted!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const firstStarted = new Promise<void>((resolve) => {
      notifyStarted = resolve;
    });
    const dispatchUpdate = callbackMap[FlowNodeTypeEnum.variableUpdate];
    vi.spyOn(callbackMap, FlowNodeTypeEnum.variableUpdate).mockImplementation(async (props) => {
      const result = await dispatchUpdate(props);
      getWorkflowContext().workflowStreamResponse?.({
        event: SseResponseEventEnum.answer,
        data: { choices: [{ delta: { content: props.node.nodeId } }] }
      } as any);
      if (props.node.nodeId === 'search') {
        notifyStarted();
        await firstGate;
      }
      return result;
    });
    const events: any[] = [];
    const provider = await createProvider({
      variableContext: parent,
      toolNodes: updates,
      runtimeNodes: updates,
      runtimeEdges: [],
      workflowProps: {
        stream: true,
        workflowStreamResponse: (event: any) => events.push(structuredClone(event))
      }
    });
    const variableEvents = () =>
      events
        .filter((event) => event.event === SseResponseEventEnum.updateVariables)
        .map((event) => event.data);
    const first = provider.executeTool({ call: createCall('first'), messages: [] });
    try {
      await firstStarted;
      expect(variableEvents()).toEqual([]);
      await provider.executeTool({
        call: { ...createCall('second'), function: { name: 'other', arguments: '{}' } },
        messages: []
      });
      expect(variableEvents()).toEqual([{ x: 0, y: 2 }]);
    } finally {
      releaseFirst();
      await first;
    }
    expect(variableEvents()).toEqual([
      { x: 0, y: 2 },
      { x: 1, y: 2 }
    ]);
    expect(parent.toStoreRecord()).toEqual({ x: 1, y: 2 });
    expect(
      events
        .filter((event) => event.event === SseResponseEventEnum.answer)
        .map((event) => event.data.choices[0].delta.content)
    ).toEqual(['search', 'other']);
  });

  it.each(['success', 'throw'] as const)(
    'commits the faster concurrent tool first when the earlier call ends with %s',
    async (firstOutcome) => {
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
          if (firstOutcome === 'throw') throw new Error('first failed');
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
      const firstResult =
        firstOutcome === 'throw' ? expect(first).rejects.toThrow('first failed') : first;
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
      await Promise.all([firstResult, second]);
      expect(parent.toStoreRecord()).toEqual(
        firstOutcome === 'success'
          ? { shared: 1, firstOnly: 1, secondOnly: 2 }
          : { shared: 2, firstOnly: 0, secondOnly: 2 }
      );
      expect(parentSet.mock.calls).toEqual([
        ['shared', 2],
        ['secondOnly', 2],
        ...(firstOutcome === 'success'
          ? [
              ['shared', 1],
              ['firstOnly', 1]
            ]
          : [])
      ]);
    }
  );

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
          nodeResponseParentId: 'toolcall_response'
        })
      );
      expect(workflowStreamResponse).not.toHaveBeenCalled();
      expect(runWorkflowMock.mock.calls[0][0]).not.toHaveProperty('workflowStreamResponse');
      expect(
        getCapturedTestWorkflowContext(runWorkflowMock.mock.calls[0][0]).workflowStreamResponse
      ).toEqual(stream ? expect.any(Function) : undefined);

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
          lastInteractive: childrenResponse
        })
      );
      expect(
        getCapturedTestWorkflowContext(runWorkflowMock.mock.calls[0][0]).workflowStreamResponse
      ).toEqual(stream ? expect.any(Function) : undefined);
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

  it('forks memoryContext and merges child system_memories for parallel dataset_search and user tools', async () => {
    const { WorkflowMemoryContext } =
      await import('@fastgpt/service/core/workflow/dispatch/context/memory');
    const parentMemoryContext = WorkflowMemoryContext.fromRecord({
      'app:app_1:rootExtract': { memory: 'baseline' }
    }).fork('node:toolCall1');

    runWorkflowMock.mockImplementation(async (args) => {
      const { runtimeNodes } = args;
      const { memoryContext } = getWorkflowContext();
      expect(args).not.toHaveProperty('memoryContext');
      const entryNode = runtimeNodes.find((node: any) => node.isEntry);
      const key = memoryContext.getNodeMemoryKey({
        runningAppInfo: { sourceType: ChatSourceTypeEnum.app, sourceId: 'app_1' },
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
      memoryContext: parentMemoryContext,
      workflowProps: {
        node: { nodeId: 'toolCall1' },
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

    expect(parentMemoryContext.getDelta()).toEqual({
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
