import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { LoopRunModeEnum } from '@fastgpt/global/core/workflow/template/system/loopRun/loopRun';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import type { WorkflowVariableStateLike } from '@fastgpt/global/core/workflow/runtime/type';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import type { DispatchFlowResponse } from '@fastgpt/service/core/workflow/dispatch/type';
import { summarizeRuntimeNodeResponses } from '@fastgpt/service/core/workflow/dispatch/utils';

const runWorkflowMock = vi.fn();

vi.mock('@fastgpt/service/core/workflow/dispatch', () => ({
  runWorkflow: (args: any) => runWorkflowMock(args)
}));

// Shrink max iterations so overflow tests run fast.
vi.mock('@fastgpt/service/env', () => ({
  serviceEnv: { WORKFLOW_MAX_LOOP_TIMES: 5 }
}));

// Import after mocks so runLoopRun pulls the mocked modules.
import { dispatchLoopRun } from '@fastgpt/service/core/workflow/dispatch/loopRun/runLoopRun';

// ─── helpers ──────────────────────────────────────────────────────────────────

const makeInput = (
  override: Partial<FlowNodeInputItemType> & { key: string }
): FlowNodeInputItemType =>
  ({
    renderTypeList: [],
    valueType: 'any' as any,
    label: '',
    ...override
  }) as FlowNodeInputItemType;

const makeLoopRunNode = (
  customOutputs: { key: string; ref: [string, string]; valueType?: string }[] = []
): RuntimeNodeItemType => ({
  nodeId: 'loopRun1',
  name: 'LoopRun',
  avatar: '',
  flowNodeType: FlowNodeTypeEnum.loopRun,
  showStatus: true,
  isEntry: true,
  catchError: false,
  inputs: [
    makeInput({ key: NodeInputKeyEnum.loopRunMode, value: LoopRunModeEnum.array }),
    makeInput({ key: NodeInputKeyEnum.loopRunInputArray, value: [] }),
    makeInput({ key: NodeInputKeyEnum.childrenNodeIdList, value: ['startNode', 'chatNode'] }),
    ...customOutputs.map((c) =>
      makeInput({
        key: c.key,
        canEdit: true,
        value: c.ref,
        valueType: (c.valueType ?? 'string') as any
      })
    )
  ],
  outputs: customOutputs.map((c) => ({
    id: c.key,
    key: c.key,
    label: c.key,
    type: FlowNodeOutputTypeEnum.dynamic,
    valueType: (c.valueType ?? 'string') as any
  }))
});

const makeRuntimeNodes = (
  childNodeValue?: any,
  opts: { withBreak?: boolean } = {}
): RuntimeNodeItemType[] => {
  const nodes: RuntimeNodeItemType[] = [
    makeLoopRunNode(),
    {
      nodeId: 'startNode',
      name: 'LoopRunStart',
      avatar: '',
      flowNodeType: FlowNodeTypeEnum.loopRunStart,
      showStatus: false,
      isEntry: false,
      inputs: [
        makeInput({ key: NodeInputKeyEnum.loopRunMode, value: LoopRunModeEnum.array }),
        makeInput({ key: NodeInputKeyEnum.nestedStartInput, value: undefined }),
        makeInput({ key: NodeInputKeyEnum.nestedStartIndex, value: undefined })
      ],
      outputs: []
    },
    {
      nodeId: 'chatNode',
      name: 'Chat',
      avatar: '',
      flowNodeType: FlowNodeTypeEnum.chatNode,
      showStatus: true,
      isEntry: false,
      inputs: [],
      outputs: [
        {
          id: 'answer',
          key: 'answer',
          label: '',
          type: 'static' as any,
          valueType: 'string' as any,
          value: childNodeValue
        }
      ]
    }
  ];
  if (opts.withBreak) {
    nodes.push({
      nodeId: 'breakNode',
      name: 'LoopRunBreak',
      avatar: '',
      flowNodeType: FlowNodeTypeEnum.loopRunBreak,
      showStatus: false,
      isEntry: false,
      inputs: [],
      outputs: []
    });
  }
  return nodes;
};

const makeDispatchFlowResponse = (
  overrides: Partial<DispatchFlowResponse> & { nodeResponses?: ChatHistoryItemResType[] } = {}
): DispatchFlowResponse => {
  const { nodeResponses = [], ...rest } = overrides;
  return {
    flowUsages: [],
    debugResponse: { memoryEdges: [], memoryNodes: [], entryNodeIds: [], nodeResponses: {} },
    workflowInteractiveResponse: undefined,
    [DispatchNodeResponseKeyEnum.toolResponse]: null,
    [DispatchNodeResponseKeyEnum.assistantResponses]: [],
    [DispatchNodeResponseKeyEnum.runTimes]: 1,
    [DispatchNodeResponseKeyEnum.newVariables]: {},
    runtimeNodeResponseSummary: summarizeRuntimeNodeResponses(undefined, nodeResponses),
    durationSeconds: 0,
    ...rest
  } as DispatchFlowResponse;
};

const makeResponseItem = (nodeId: string, override: Partial<ChatHistoryItemResType> = {}) =>
  ({
    nodeId,
    moduleType: FlowNodeTypeEnum.chatNode,
    moduleName: nodeId,
    ...override
  }) as ChatHistoryItemResType;

const makeVariableState = (variables: Record<string, unknown> = {}): WorkflowVariableStateLike =>
  ({
    get: (key: string) => variables[key],
    set: async (key: string, value: unknown) => {
      variables[key] = value;
      return value;
    },
    getStoreValue: (key: string) => variables[key],
    getFileStoreValueByRuntimeUrl: () => undefined,
    toRuntimeRecord: () => variables,
    toStoreRecord: () => variables,
    clone: () => makeVariableState({ ...variables })
  }) satisfies WorkflowVariableStateLike;

const makeProps = (
  params: any,
  opts: { withBreak?: boolean; childrenNodeIdList?: string[] } = {}
) => {
  const runtimeNodes = makeRuntimeNodes('from-chat', { withBreak: opts.withBreak });
  const node = runtimeNodes[0];
  // Keep childrenNodeIdList in sync with whether a break node exists
  const defaultChildren = opts.withBreak
    ? ['startNode', 'chatNode', 'breakNode']
    : ['startNode', 'chatNode'];
  const finalParams = {
    ...params,
    [NodeInputKeyEnum.childrenNodeIdList]:
      opts.childrenNodeIdList ?? params[NodeInputKeyEnum.childrenNodeIdList] ?? defaultChildren
  };
  return {
    params: finalParams,
    node,
    runtimeNodes,
    runtimeNodesMap: new Map(runtimeNodes.map((n) => [n.nodeId, n])),
    runtimeEdges: [],
    variableState: makeVariableState(),
    usagePush: vi.fn(),
    lastInteractive: undefined,
    checkIsStopping: () => false
  } as any;
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('runLoopRun (integration with mocked runWorkflow)', () => {
  beforeEach(() => {
    runWorkflowMock.mockReset();
  });

  it('array mode 数组正常跑完 → loopHistory 全 success, data 含最后一轮快照', async () => {
    // Each iteration returns a clean response that writes a new value to chatNode
    runWorkflowMock.mockImplementation((args: any) => {
      // Simulate chatNode producing an output for this iteration
      const chatNode = args.runtimeNodes.find((n: any) => n.nodeId === 'chatNode');
      if (chatNode)
        chatNode.outputs[0].value = `v-${
          args.runtimeNodes
            .find((n: any) => n.nodeId === 'startNode')
            ?.inputs.find((i: any) => i.key === NodeInputKeyEnum.nestedStartInput)?.value
        }`;
      return Promise.resolve(
        makeDispatchFlowResponse({
          nodeResponses: [makeResponseItem('startNode'), makeResponseItem('chatNode')]
        })
      );
    });

    const customOutputs = [{ key: 'answer', ref: ['chatNode', 'answer'] as [string, string] }];
    const runtimeNodes = makeRuntimeNodes();
    const node = makeLoopRunNode(customOutputs);
    runtimeNodes[0] = node;
    const props = {
      params: {
        [NodeInputKeyEnum.loopRunMode]: LoopRunModeEnum.array,
        [NodeInputKeyEnum.loopRunInputArray]: ['a', 'b', 'c'],
        [NodeInputKeyEnum.childrenNodeIdList]: ['startNode', 'chatNode']
      },
      node,
      runtimeNodes,
      runtimeNodesMap: new Map(runtimeNodes.map((n) => [n.nodeId, n])),
      runtimeEdges: [],
      variableState: makeVariableState(),
      usagePush: vi.fn(),
      lastInteractive: undefined,
      checkIsStopping: () => false
    } as any;

    const result: any = await dispatchLoopRun(props);

    expect(runWorkflowMock).toHaveBeenCalledTimes(3);
    const nodeResponse = result[DispatchNodeResponseKeyEnum.nodeResponse];
    expect(nodeResponse.loopRunIterations).toBe(3);
    expect(nodeResponse.loopRunHistory).toHaveLength(3);
    expect(nodeResponse.loopRunHistory.every((h: any) => h.success)).toBe(true);
    // Last snapshot exposed on data
    expect(result.data.answer).toBe('v-c');
    expect(result.error).toBeUndefined();
  });

  it('子运行返回的 newVariables 不再透出到 loopRun 节点结果', async () => {
    runWorkflowMock.mockImplementation((args: any) => {
      void args.variableState.set('runtimeOnly', 'runtime-value');
      return Promise.resolve(
        makeDispatchFlowResponse({
          [DispatchNodeResponseKeyEnum.newVariables]: {
            runtimeOnly: { value: '', secret: 'encrypted-store-value' }
          }
        })
      );
    });

    const props = makeProps({
      [NodeInputKeyEnum.loopRunMode]: LoopRunModeEnum.array,
      [NodeInputKeyEnum.loopRunInputArray]: ['a']
    });

    const result: any = await dispatchLoopRun(props);

    expect(result[DispatchNodeResponseKeyEnum.newVariables]).toBeUndefined();
  });

  it('array mode 第 2 轮节点出错 → 本轮 success:false, 失败轮快照对未跑节点返回 undefined', async () => {
    let iter = 0;
    runWorkflowMock.mockImplementation((args: any) => {
      iter++;
      const chatNode = args.runtimeNodes.find((n: any) => n.nodeId === 'chatNode');
      if (iter === 1) {
        chatNode.outputs[0].value = 'v1';
        return Promise.resolve(
          makeDispatchFlowResponse({
            nodeResponses: [makeResponseItem('startNode'), makeResponseItem('chatNode')]
          })
        );
      }
      // iter === 2: chatNode 未跑到（startNode 先出错了）
      return Promise.resolve(
        makeDispatchFlowResponse({
          nodeResponses: [makeResponseItem('startNode', { error: 'boom' })]
        })
      );
    });

    const customOutputs = [{ key: 'answer', ref: ['chatNode', 'answer'] as [string, string] }];
    const runtimeNodes = makeRuntimeNodes();
    const node = makeLoopRunNode(customOutputs);
    runtimeNodes[0] = node;
    const props = {
      params: {
        [NodeInputKeyEnum.loopRunMode]: LoopRunModeEnum.array,
        [NodeInputKeyEnum.loopRunInputArray]: ['a', 'b', 'c'],
        [NodeInputKeyEnum.childrenNodeIdList]: ['startNode', 'chatNode']
      },
      node,
      runtimeNodes,
      runtimeNodesMap: new Map(runtimeNodes.map((n) => [n.nodeId, n])),
      runtimeEdges: [],
      variableState: makeVariableState(),
      usagePush: vi.fn(),
      lastInteractive: undefined,
      checkIsStopping: () => false
    } as any;

    const result: any = await dispatchLoopRun(props);

    expect(runWorkflowMock).toHaveBeenCalledTimes(2);
    const history = result[DispatchNodeResponseKeyEnum.nodeResponse].loopRunHistory;
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({ iteration: 1, success: true });
    expect(history[1]).toMatchObject({ iteration: 2, success: false, error: 'boom' });
    // Failure iteration: chatNode didn't finish → `answer` filtered to undefined
    expect(history[1].customOutputs.answer).toBeUndefined();
    // Error surfaces through standard node error protocol
    expect(result.error?.[NodeOutputKeyEnum.errorText]).toBe('boom');
    expect(result.data.answer).toBeUndefined();
  });

  it('array mode loopRunBreak 命中 → 后续迭代不再执行', async () => {
    let iter = 0;
    runWorkflowMock.mockImplementation(() => {
      iter++;
      const nodeResponses = [makeResponseItem('startNode'), makeResponseItem('chatNode')];
      if (iter === 2) {
        nodeResponses.push(
          makeResponseItem('breakNode', { moduleType: FlowNodeTypeEnum.loopRunBreak })
        );
      }
      return Promise.resolve(makeDispatchFlowResponse({ nodeResponses }));
    });

    const props = makeProps({
      [NodeInputKeyEnum.loopRunMode]: LoopRunModeEnum.array,
      [NodeInputKeyEnum.loopRunInputArray]: ['a', 'b', 'c', 'd'],
      [NodeInputKeyEnum.childrenNodeIdList]: ['startNode', 'chatNode']
    });

    const result: any = await dispatchLoopRun(props);

    expect(runWorkflowMock).toHaveBeenCalledTimes(2);
    expect(result[DispatchNodeResponseKeyEnum.nodeResponse].loopRunIterations).toBe(2);
  });

  it('conditional mode - loopRunBreak 第 3 轮命中 → 正常退出', async () => {
    let iter = 0;
    runWorkflowMock.mockImplementation(() => {
      iter++;
      const nodeResponses = [makeResponseItem('startNode'), makeResponseItem('chatNode')];
      if (iter === 3) {
        nodeResponses.push(
          makeResponseItem('breakNode', { moduleType: FlowNodeTypeEnum.loopRunBreak })
        );
      }
      return Promise.resolve(makeDispatchFlowResponse({ nodeResponses }));
    });

    const props = makeProps(
      { [NodeInputKeyEnum.loopRunMode]: LoopRunModeEnum.conditional },
      { withBreak: true }
    );

    const result: any = await dispatchLoopRun(props);
    expect(iter).toBe(3);
    expect(result[DispatchNodeResponseKeyEnum.nodeResponse].loopRunIterations).toBe(3);
  });

  it('conditional mode - 子节点 catchError=false 出错 → 当轮 break, 后续迭代不执行', async () => {
    // 对齐 dispatch/index.ts 错误归一化后的 nodeResponse summary 形状：
    // dispatcher 返回 `{error}` + catchError=false 会把 error 写回 nodeResponse，
    // 所以 nodeResponse 项上 `r.error` 必定可见。用户场景：code 节点 iter=2 throw。
    let iter = 0;
    runWorkflowMock.mockImplementation(() => {
      iter++;
      if (iter === 2) {
        return Promise.resolve(
          makeDispatchFlowResponse({
            nodeResponses: [
              makeResponseItem('startNode'),
              makeResponseItem('codeNode', { error: '111' })
            ]
          })
        );
      }
      return Promise.resolve(
        makeDispatchFlowResponse({
          nodeResponses: [makeResponseItem('startNode'), makeResponseItem('codeNode')]
        })
      );
    });

    const props = makeProps(
      { [NodeInputKeyEnum.loopRunMode]: LoopRunModeEnum.conditional },
      { withBreak: true }
    );

    const result: any = await dispatchLoopRun(props);
    expect(iter).toBe(2);
    const nodeResponse = result[DispatchNodeResponseKeyEnum.nodeResponse];
    expect(nodeResponse.loopRunIterations).toBe(2);
    expect(nodeResponse.loopRunHistory[1]).toMatchObject({
      iteration: 2,
      success: false,
      error: '111'
    });
    expect(result.error?.[NodeOutputKeyEnum.errorText]).toBe('111');
  });

  it('conditional mode - 无 break 节点 → precheck 返回 errorText 并不执行任何迭代', async () => {
    const props = makeProps({ [NodeInputKeyEnum.loopRunMode]: LoopRunModeEnum.conditional });
    const result: any = await dispatchLoopRun(props);
    expect(result.error?.[NodeOutputKeyEnum.errorText]).toBe(
      'workflow:loop_run_conditional_requires_break'
    );
    const nodeResponse = result[DispatchNodeResponseKeyEnum.nodeResponse];
    expect(nodeResponse.errorText).toBe('workflow:loop_run_conditional_requires_break');
    expect(runWorkflowMock).not.toHaveBeenCalled();
  });

  it('conditional mode - 有 break 节点但运行中从未命中 → 超过 max → 返回 error 并保留 loopHistory', async () => {
    runWorkflowMock.mockImplementation(() =>
      Promise.resolve(
        makeDispatchFlowResponse({
          nodeResponses: [makeResponseItem('startNode'), makeResponseItem('chatNode')]
        })
      )
    );

    const props = makeProps(
      { [NodeInputKeyEnum.loopRunMode]: LoopRunModeEnum.conditional },
      { withBreak: true }
    );

    const result: any = await dispatchLoopRun(props);
    // 触发 5 次预算后兜底，loopHistory 保留已跑完的每一轮以便排查
    expect(runWorkflowMock).toHaveBeenCalledTimes(5);
    expect(result.error?.[NodeOutputKeyEnum.errorText]).toBe(
      'workflow:loop_run_max_iterations_exceeded'
    );
    const nodeResponse = result[DispatchNodeResponseKeyEnum.nodeResponse];
    expect(nodeResponse.loopRunIterations).toBe(5);
    expect(nodeResponse.loopRunHistory).toHaveLength(5);
    expect(nodeResponse.loopRunHistory.every((h: any) => h.success)).toBe(true);
  });

  it('interactive 响应 → 返回 loopInteractive 状态, 不 push 失败 history', async () => {
    const interactivePayload: any = {
      entryNodeIds: ['userSelectNode'],
      memoryEdges: [],
      nodeOutputs: [],
      interactive: { type: 'userSelect', params: {} }
    };
    runWorkflowMock.mockImplementation(() =>
      Promise.resolve(
        makeDispatchFlowResponse({
          nodeResponses: [makeResponseItem('startNode')],
          workflowInteractiveResponse: interactivePayload
        })
      )
    );

    const props = makeProps({
      [NodeInputKeyEnum.loopRunMode]: LoopRunModeEnum.array,
      [NodeInputKeyEnum.loopRunInputArray]: ['a', 'b'],
      [NodeInputKeyEnum.childrenNodeIdList]: ['startNode', 'chatNode']
    });

    const result: any = await dispatchLoopRun(props);
    const interactive = result[DispatchNodeResponseKeyEnum.interactive];
    const nodeResponse = result[DispatchNodeResponseKeyEnum.nodeResponse];
    expect(interactive).toBeDefined();
    expect(interactive.type).toBe('loopRunInteractive');
    expect(interactive.params.childrenResponse).toBe(interactivePayload);
    expect(interactive.params.iteration).toBe(1);
    expect(interactive.params.loopHistory).toEqual([]);
    expect(nodeResponse.loopRunHistory).toEqual([]);
    expect(nodeResponse.loopRunDetail).toBeUndefined();
    expect(nodeResponse.childResponseCount).toBe(2);
    expect(nodeResponse.childTotalPoints).toBeUndefined();
  });

  it('lastInteractive 恢复 → 从中断轮次续跑, 保留已累积 loopHistory', async () => {
    // Resume at iteration 2 (0-based index 1). Prior history has 1 success entry.
    // The mocked runWorkflow returns success with break for iteration 2.
    runWorkflowMock.mockImplementationOnce(() =>
      Promise.resolve(
        makeDispatchFlowResponse({
          nodeResponses: [
            makeResponseItem('startNode'),
            makeResponseItem('chatNode'),
            makeResponseItem('breakNode', { moduleType: FlowNodeTypeEnum.loopRunBreak })
          ]
        })
      )
    );

    const priorHistory = [{ iteration: 1, customOutputs: {}, success: true }];
    const runtimeNodes = makeRuntimeNodes();
    const node = runtimeNodes[0];
    const props = {
      params: {
        [NodeInputKeyEnum.loopRunMode]: LoopRunModeEnum.array,
        [NodeInputKeyEnum.loopRunInputArray]: ['a', 'b', 'c'],
        [NodeInputKeyEnum.childrenNodeIdList]: ['startNode', 'chatNode']
      },
      node,
      runtimeNodes,
      runtimeNodesMap: new Map(runtimeNodes.map((n) => [n.nodeId, n])),
      runtimeEdges: [],
      variableState: makeVariableState(),
      usagePush: vi.fn(),
      lastInteractive: {
        type: 'loopRunInteractive',
        params: {
          loopHistory: priorHistory,
          iteration: 2,
          childrenResponse: { entryNodeIds: ['userSelectNode'] }
        }
      },
      checkIsStopping: () => false
    } as any;

    const result: any = await dispatchLoopRun(props);

    // Only one runWorkflow call: iteration 2 — then break terminates.
    expect(runWorkflowMock).toHaveBeenCalledTimes(1);
    const history = result[DispatchNodeResponseKeyEnum.nodeResponse].loopRunHistory;
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({ iteration: 1, success: true });
    expect(history[1]).toMatchObject({ iteration: 2, success: true });
  });

  it('lastInteractive 恢复 → 完成时只写入恢复后的 wrapper 增量统计', async () => {
    const nodeResponseWriter = {
      recordWithParent: vi.fn().mockResolvedValue([])
    };
    runWorkflowMock.mockImplementationOnce(() =>
      Promise.resolve(
        makeDispatchFlowResponse({
          nodeResponses: [
            makeResponseItem('userSelectNode', { totalPoints: 2 }),
            makeResponseItem('chatNode', { totalPoints: 3, childTotalPoints: 4 })
          ],
          flowUsages: [
            {
              moduleName: 'resume',
              totalPoints: 5
            }
          ] as any
        })
      )
    );

    const preInterruptSummary = summarizeRuntimeNodeResponses(undefined, [
      makeResponseItem('startNode', { totalPoints: 1 })
    ]);
    const runtimeNodes = makeRuntimeNodes();
    const node = runtimeNodes[0];
    const props = {
      params: {
        [NodeInputKeyEnum.loopRunMode]: LoopRunModeEnum.array,
        [NodeInputKeyEnum.loopRunInputArray]: ['a'],
        [NodeInputKeyEnum.childrenNodeIdList]: ['startNode', 'userSelectNode', 'chatNode']
      },
      node,
      runtimeNodes,
      runtimeNodesMap: new Map(runtimeNodes.map((n) => [n.nodeId, n])),
      runtimeEdges: [],
      variableState: makeVariableState(),
      usagePush: vi.fn(),
      lastInteractive: {
        type: 'loopRunInteractive',
        params: {
          loopHistory: [],
          iteration: 1,
          childrenResponse: { entryNodeIds: ['userSelectNode'] },
          pendingIterationSummary: preInterruptSummary
        }
      },
      nodeResponseWriter,
      nodeResponseParentId: 'loop-parent-response',
      checkIsStopping: () => false
    } as any;

    const result: any = await dispatchLoopRun(props);
    const nodeResponse = result[DispatchNodeResponseKeyEnum.nodeResponse];

    expect(nodeResponse.totalPoints).toBe(5);
    expect(nodeResponse.childTotalPoints).toBeUndefined();
    expect(nodeResponse.childResponseCount).toBe(3);
    expect(nodeResponseWriter.recordWithParent).toHaveBeenCalledTimes(1);
    expect(nodeResponseWriter.recordWithParent.mock.calls[0][0][0]).toMatchObject({
      id: 'loop-parent-response:iter:1',
      totalPoints: 5,
      childResponseCount: 2
    });
  });

  it('lastInteractive 恢复后续跑多轮 → 恢复后非终止轮不应再携带 lastInteractive', async () => {
    // Regression guard: resume state must be cleared after its own iteration.
    const interactivePayload: any = {
      entryNodeIds: ['userSelectNode'],
      memoryEdges: [{ source: 'a', target: 'b', status: 'active' }],
      nodeOutputs: []
    };

    runWorkflowMock.mockImplementation(() =>
      Promise.resolve(
        makeDispatchFlowResponse({
          nodeResponses: [makeResponseItem('startNode'), makeResponseItem('chatNode')]
        })
      )
    );

    const priorHistory = [{ iteration: 1, customOutputs: {}, success: true }];
    const runtimeNodes = makeRuntimeNodes();
    const node = runtimeNodes[0];
    const props = {
      params: {
        [NodeInputKeyEnum.loopRunMode]: LoopRunModeEnum.array,
        [NodeInputKeyEnum.loopRunInputArray]: ['a', 'b', 'c'],
        [NodeInputKeyEnum.childrenNodeIdList]: ['startNode', 'chatNode']
      },
      node,
      runtimeNodes,
      runtimeNodesMap: new Map(runtimeNodes.map((n) => [n.nodeId, n])),
      runtimeEdges: [],
      variableState: makeVariableState(),
      usagePush: vi.fn(),
      lastInteractive: {
        type: 'loopRunInteractive',
        params: {
          loopHistory: priorHistory,
          iteration: 2,
          childrenResponse: interactivePayload
        }
      },
      checkIsStopping: () => false
    } as any;

    await dispatchLoopRun(props);

    expect(runWorkflowMock).toHaveBeenCalledTimes(2);

    const resumeCall = runWorkflowMock.mock.calls[0][0];
    expect(resumeCall.lastInteractive).toBe(interactivePayload);

    const nextCall = runWorkflowMock.mock.calls[1][0];
    expect(nextCall.lastInteractive).toBeUndefined();
    expect(nextCall.runtimeEdges).toEqual([]);
  });

  it('array mode 输入非数组 → precheck 返回 errorText', async () => {
    const props = makeProps({
      [NodeInputKeyEnum.loopRunMode]: LoopRunModeEnum.array,
      [NodeInputKeyEnum.loopRunInputArray]: 'not-array' as any,
      [NodeInputKeyEnum.childrenNodeIdList]: ['startNode', 'chatNode']
    });
    const result: any = await dispatchLoopRun(props);
    expect(result.error?.[NodeOutputKeyEnum.errorText]).toBe('workflow:loop_run_input_not_array');
    expect(runWorkflowMock).not.toHaveBeenCalled();
  });

  it('array mode 数组长度超上限 → precheck 返回 errorText', async () => {
    const props = makeProps({
      [NodeInputKeyEnum.loopRunMode]: LoopRunModeEnum.array,
      [NodeInputKeyEnum.loopRunInputArray]: new Array(100).fill('x'),
      [NodeInputKeyEnum.childrenNodeIdList]: ['startNode', 'chatNode']
    });
    const result: any = await dispatchLoopRun(props);
    expect(result.error?.[NodeOutputKeyEnum.errorText]).toBe(
      'workflow:loop_run_max_iterations_exceeded'
    );
    expect(runWorkflowMock).not.toHaveBeenCalled();
  });

  it('成功轮：未跑完的节点引用在快照里过滤为 undefined（避免跨迭代 stale value）', async () => {
    // Iteration 1: both startNode & chatNode run. Iteration 2: chatNode skipped
    // (e.g. if-else branch). Snapshot for iteration 2 must not leak iteration-1 value.
    let iter = 0;
    runWorkflowMock.mockImplementation((args: any) => {
      iter++;
      const chatNode = args.runtimeNodes.find((n: any) => n.nodeId === 'chatNode');
      if (iter === 1) {
        if (chatNode) chatNode.outputs[0].value = 'stale-from-iter-1';
        return Promise.resolve(
          makeDispatchFlowResponse({
            nodeResponses: [makeResponseItem('startNode'), makeResponseItem('chatNode')]
          })
        );
      }
      // iter === 2: chatNode skipped, but outputs.value still holds 'stale-from-iter-1'
      return Promise.resolve(
        makeDispatchFlowResponse({
          nodeResponses: [makeResponseItem('startNode')]
        })
      );
    });

    const customOutputs = [{ key: 'answer', ref: ['chatNode', 'answer'] as [string, string] }];
    const runtimeNodes = makeRuntimeNodes();
    const node = makeLoopRunNode(customOutputs);
    runtimeNodes[0] = node;
    const props = {
      params: {
        [NodeInputKeyEnum.loopRunMode]: LoopRunModeEnum.array,
        [NodeInputKeyEnum.loopRunInputArray]: ['a', 'b'],
        [NodeInputKeyEnum.childrenNodeIdList]: ['startNode', 'chatNode']
      },
      node,
      runtimeNodes,
      runtimeNodesMap: new Map(runtimeNodes.map((n) => [n.nodeId, n])),
      runtimeEdges: [],
      variableState: makeVariableState(),
      usagePush: vi.fn(),
      lastInteractive: undefined,
      checkIsStopping: () => false
    } as any;

    const result: any = await dispatchLoopRun(props);
    const history = result[DispatchNodeResponseKeyEnum.nodeResponse].loopRunHistory;
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({ iteration: 1, success: true });
    expect(history[0].customOutputs.answer).toBe('stale-from-iter-1');
    expect(history[1]).toMatchObject({ iteration: 2, success: true });
    // chatNode didn't run this iteration → ref filtered to undefined, not leaked.
    expect(history[1].customOutputs.answer).toBeUndefined();
  });

  it('无 writer 时父响应只保留每轮轻量 child 统计，不内嵌 loopRunDetail', async () => {
    runWorkflowMock.mockImplementation(() =>
      Promise.resolve(
        makeDispatchFlowResponse({
          nodeResponses: [makeResponseItem('startNode'), makeResponseItem('chatNode')]
        })
      )
    );

    const props = makeProps({
      [NodeInputKeyEnum.loopRunMode]: LoopRunModeEnum.array,
      [NodeInputKeyEnum.loopRunInputArray]: ['a', 'b'],
      [NodeInputKeyEnum.childrenNodeIdList]: ['startNode', 'chatNode']
    });

    const result: any = await dispatchLoopRun(props);
    const nodeResponse = result[DispatchNodeResponseKeyEnum.nodeResponse];
    expect(nodeResponse.loopRunDetail).toBeUndefined();
    expect(nodeResponse.childResponseCount).toBe(6);
    expect(nodeResponse.childTotalPoints).toBeUndefined();
    expect(nodeResponse.loopRunHistory).toHaveLength(2);
  });

  it('共用 nodeResponseWriter 时写入每轮包装节点，父响应只保留轻量统计', async () => {
    const nodeResponseWriter = {
      recordWithParent: vi.fn().mockResolvedValue([])
    };
    runWorkflowMock.mockImplementation(() =>
      Promise.resolve(
        makeDispatchFlowResponse({
          nodeResponses: [
            makeResponseItem('startNode', { totalPoints: 1 }),
            makeResponseItem('chatNode', { totalPoints: 2, childTotalPoints: 3 })
          ],
          flowUsages: [{ moduleName: 'loop', totalPoints: 3 }] as any
        })
      )
    );

    const props = {
      ...makeProps({
        [NodeInputKeyEnum.loopRunMode]: LoopRunModeEnum.array,
        [NodeInputKeyEnum.loopRunInputArray]: ['a'],
        [NodeInputKeyEnum.childrenNodeIdList]: ['startNode', 'chatNode']
      }),
      nodeResponseWriter,
      nodeResponseParentId: 'loop-parent-response'
    };

    const result: any = await dispatchLoopRun(props);
    const nodeResponse = result[DispatchNodeResponseKeyEnum.nodeResponse];

    expect(runWorkflowMock.mock.calls[0][0].nodeResponseParentId).toBe(
      'loop-parent-response:iter:1'
    );
    expect(nodeResponseWriter.recordWithParent).toHaveBeenCalledTimes(1);
    expect(nodeResponseWriter.recordWithParent.mock.calls[0][1]).toBe('loop-parent-response');
    expect(nodeResponseWriter.recordWithParent.mock.calls[0][0][0]).toMatchObject({
      id: 'loop-parent-response:iter:1',
      childResponseCount: 2
    });
    expect(
      nodeResponseWriter.recordWithParent.mock.calls[0][0][0].childTotalPoints
    ).toBeUndefined();
    expect(
      nodeResponseWriter.recordWithParent.mock.calls[0][0][0].childrenResponses
    ).toBeUndefined();
    expect(nodeResponse.loopRunDetail).toBeUndefined();
    expect(nodeResponse.totalPoints).toBe(3);
    expect(nodeResponse.childTotalPoints).toBeUndefined();
  });

  it('失败轮不内嵌 loopRunDetail，父响应保留错误和 child 统计', async () => {
    let iter = 0;
    runWorkflowMock.mockImplementation(() => {
      iter++;
      if (iter === 2) {
        return Promise.resolve(
          makeDispatchFlowResponse({
            nodeResponses: [
              makeResponseItem('startNode'),
              makeResponseItem('chatNode', { error: 'kaboom' })
            ]
          })
        );
      }
      return Promise.resolve(
        makeDispatchFlowResponse({
          nodeResponses: [makeResponseItem('startNode'), makeResponseItem('chatNode')]
        })
      );
    });

    const props = makeProps({
      [NodeInputKeyEnum.loopRunMode]: LoopRunModeEnum.array,
      [NodeInputKeyEnum.loopRunInputArray]: ['a', 'b', 'c'],
      [NodeInputKeyEnum.childrenNodeIdList]: ['startNode', 'chatNode']
    });

    const result: any = await dispatchLoopRun(props);
    const nodeResponse = result[DispatchNodeResponseKeyEnum.nodeResponse];
    expect(nodeResponse.loopRunDetail).toBeUndefined();
    expect(nodeResponse.errorText).toBe('kaboom');
    expect(nodeResponse.childResponseCount).toBe(6);
    expect(nodeResponse.loopRunHistory).toHaveLength(2);
    expect(nodeResponse.loopRunHistory[1]).toMatchObject({
      iteration: 2,
      success: false,
      error: 'kaboom'
    });
  });

  it('interactive 中断轮：写入本轮 wrapper，确保已写 child 可挂到 loop 下', async () => {
    const interactivePayload: any = {
      entryNodeIds: ['userSelectNode'],
      memoryEdges: [],
      nodeOutputs: [],
      interactive: { type: 'userSelect', params: {} }
    };
    runWorkflowMock.mockImplementation(() =>
      Promise.resolve(
        makeDispatchFlowResponse({
          nodeResponses: [makeResponseItem('startNode')],
          workflowInteractiveResponse: interactivePayload
        })
      )
    );
    const nodeResponseWriter = {
      recordWithParent: vi.fn().mockResolvedValue([])
    };

    const props = {
      ...makeProps({
        [NodeInputKeyEnum.loopRunMode]: LoopRunModeEnum.array,
        [NodeInputKeyEnum.loopRunInputArray]: ['a', 'b'],
        [NodeInputKeyEnum.childrenNodeIdList]: ['startNode', 'chatNode']
      }),
      nodeResponseWriter,
      nodeResponseParentId: 'loop-parent-response'
    };

    const result: any = await dispatchLoopRun(props);
    const nodeResponse = result[DispatchNodeResponseKeyEnum.nodeResponse];
    expect(nodeResponse.loopRunDetail).toBeUndefined();
    expect(nodeResponse.childResponseCount).toBe(2);
    expect(nodeResponseWriter.recordWithParent).toHaveBeenCalledTimes(1);
    expect(nodeResponseWriter.recordWithParent.mock.calls[0][1]).toBe('loop-parent-response');
    expect(nodeResponseWriter.recordWithParent.mock.calls[0][0][0]).toMatchObject({
      id: 'loop-parent-response:iter:1',
      childResponseCount: 1
    });
  });

  it('array mode 数组长度 === max → 跑满且不报超限（回归：== max 不算超限）', async () => {
    runWorkflowMock.mockImplementation(() =>
      Promise.resolve(
        makeDispatchFlowResponse({
          nodeResponses: [makeResponseItem('startNode'), makeResponseItem('chatNode')]
        })
      )
    );

    const props = makeProps({
      [NodeInputKeyEnum.loopRunMode]: LoopRunModeEnum.array,
      [NodeInputKeyEnum.loopRunInputArray]: ['a', 'b', 'c', 'd', 'e'],
      [NodeInputKeyEnum.childrenNodeIdList]: ['startNode', 'chatNode']
    });

    const result: any = await dispatchLoopRun(props);
    expect(runWorkflowMock).toHaveBeenCalledTimes(5);
    const nodeResponse = result[DispatchNodeResponseKeyEnum.nodeResponse];
    expect(nodeResponse.loopRunIterations).toBe(5);
    expect(nodeResponse.loopRunHistory.every((h: any) => h.success)).toBe(true);
    expect(result.error).toBeUndefined();
    expect(nodeResponse.errorText).toBeUndefined();
  });

  it('resume 后续迭代：childrenResponse.entryNodeIds 标的节点 isEntry 不应泄漏到下一轮', async () => {
    const interactivePayload: any = {
      entryNodeIds: ['chatNode'],
      memoryEdges: [],
      nodeOutputs: []
    };
    // Snapshot chatNode.isEntry when runWorkflow is invoked — isolatedNodes is a
    // single array reused across iterations, so reading it after the run would
    // always see the post-reset state.
    const chatEntryPerCall: boolean[] = [];
    runWorkflowMock.mockImplementation((args: any) => {
      const chatNode = args.runtimeNodes.find((n: any) => n.nodeId === 'chatNode');
      chatEntryPerCall.push(!!chatNode?.isEntry);
      return Promise.resolve(
        makeDispatchFlowResponse({
          nodeResponses: [makeResponseItem('startNode'), makeResponseItem('chatNode')]
        })
      );
    });

    const runtimeNodes = makeRuntimeNodes();
    const node = runtimeNodes[0];
    const props = {
      params: {
        [NodeInputKeyEnum.loopRunMode]: LoopRunModeEnum.array,
        [NodeInputKeyEnum.loopRunInputArray]: ['a', 'b', 'c'],
        [NodeInputKeyEnum.childrenNodeIdList]: ['startNode', 'chatNode']
      },
      node,
      runtimeNodes,
      runtimeNodesMap: new Map(runtimeNodes.map((n) => [n.nodeId, n])),
      runtimeEdges: [],
      variableState: makeVariableState(),
      usagePush: vi.fn(),
      checkIsStopping: () => false,
      lastInteractive: {
        type: 'loopRunInteractive',
        params: {
          loopHistory: [{ iteration: 1, customOutputs: {}, success: true }],
          iteration: 2,
          childrenResponse: interactivePayload
        }
      }
    } as any;

    await dispatchLoopRun(props);
    expect(runWorkflowMock).toHaveBeenCalledTimes(2);
    expect(chatEntryPerCall[0]).toBe(true);
    expect(chatEntryPerCall[1]).toBe(false);
  });
});
