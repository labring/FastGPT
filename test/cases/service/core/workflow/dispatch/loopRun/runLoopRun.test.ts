import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { LoopRunModeEnum } from '@fastgpt/global/core/workflow/template/system/loopRun/loopRun';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import type { DispatchFlowResponse } from '@fastgpt/service/core/workflow/dispatch/type';

const runWorkflowMock = vi.fn();

vi.mock('@fastgpt/service/core/workflow/dispatch', () => ({
  runWorkflow: (args: any) => runWorkflowMock(args)
}));

// Shrink max iterations so overflow tests run fast.
vi.mock('@fastgpt/service/env', () => ({
  env: { WORKFLOW_MAX_LOOP_TIMES: 5 }
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
  outputs: []
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
  overrides: Partial<DispatchFlowResponse> = {}
): DispatchFlowResponse =>
  ({
    flowResponses: [],
    flowUsages: [],
    debugResponse: { memoryEdges: [], memoryNodes: [], entryNodeIds: [], nodeResponses: {} },
    workflowInteractiveResponse: undefined,
    [DispatchNodeResponseKeyEnum.toolResponses]: null,
    [DispatchNodeResponseKeyEnum.assistantResponses]: [],
    [DispatchNodeResponseKeyEnum.runTimes]: 1,
    [DispatchNodeResponseKeyEnum.newVariables]: {},
    durationSeconds: 0,
    ...overrides
  }) as DispatchFlowResponse;

const makeResponseItem = (nodeId: string, override: Partial<ChatHistoryItemResType> = {}) =>
  ({
    nodeId,
    moduleType: FlowNodeTypeEnum.chatNode,
    moduleName: nodeId,
    ...override
  }) as ChatHistoryItemResType;

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
    variables: {},
    usagePush: vi.fn(),
    lastInteractive: undefined
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
          flowResponses: [makeResponseItem('startNode'), makeResponseItem('chatNode')]
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
      variables: {},
      usagePush: vi.fn(),
      lastInteractive: undefined
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

  it('array mode 第 2 轮节点出错 → 本轮 success:false, 失败轮快照对未跑节点返回 undefined', async () => {
    let iter = 0;
    runWorkflowMock.mockImplementation((args: any) => {
      iter++;
      const chatNode = args.runtimeNodes.find((n: any) => n.nodeId === 'chatNode');
      if (iter === 1) {
        chatNode.outputs[0].value = 'v1';
        return Promise.resolve(
          makeDispatchFlowResponse({
            flowResponses: [makeResponseItem('startNode'), makeResponseItem('chatNode')]
          })
        );
      }
      // iter === 2: chatNode 未跑到（startNode 先出错了）
      return Promise.resolve(
        makeDispatchFlowResponse({
          flowResponses: [makeResponseItem('startNode', { error: 'boom' })]
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
      variables: {},
      usagePush: vi.fn(),
      lastInteractive: undefined
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
      const flowResponses = [makeResponseItem('startNode'), makeResponseItem('chatNode')];
      if (iter === 2) {
        flowResponses.push(
          makeResponseItem('breakNode', { moduleType: FlowNodeTypeEnum.loopRunBreak })
        );
      }
      return Promise.resolve(makeDispatchFlowResponse({ flowResponses }));
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
      const flowResponses = [makeResponseItem('startNode'), makeResponseItem('chatNode')];
      if (iter === 3) {
        flowResponses.push(
          makeResponseItem('breakNode', { moduleType: FlowNodeTypeEnum.loopRunBreak })
        );
      }
      return Promise.resolve(makeDispatchFlowResponse({ flowResponses }));
    });

    const props = makeProps(
      { [NodeInputKeyEnum.loopRunMode]: LoopRunModeEnum.conditional },
      { withBreak: true }
    );

    const result: any = await dispatchLoopRun(props);
    expect(iter).toBe(3);
    expect(result[DispatchNodeResponseKeyEnum.nodeResponse].loopRunIterations).toBe(3);
  });

  it('conditional mode - 无 break 节点 → precheck reject', async () => {
    // No runWorkflow call expected
    const props = makeProps({ [NodeInputKeyEnum.loopRunMode]: LoopRunModeEnum.conditional });
    await expect(dispatchLoopRun(props)).rejects.toMatch(/requires at least one loopRunBreak/i);
    expect(runWorkflowMock).not.toHaveBeenCalled();
  });

  it('conditional mode - 有 break 节点但运行中从未命中 → 超过 max → 返回 error 并保留 loopHistory', async () => {
    runWorkflowMock.mockImplementation(() =>
      Promise.resolve(
        makeDispatchFlowResponse({
          flowResponses: [makeResponseItem('startNode'), makeResponseItem('chatNode')]
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
    expect(result.error?.[NodeOutputKeyEnum.errorText]).toMatch(/exceeded 5 iterations/i);
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
          flowResponses: [makeResponseItem('startNode')],
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
    expect(interactive).toBeDefined();
    expect(interactive.type).toBe('loopRunInteractive');
    expect(interactive.params.childrenResponse).toBe(interactivePayload);
    expect(interactive.params.iteration).toBe(1);
    expect(interactive.params.loopHistory).toEqual([]);
    // No history written for interactive iteration
    expect(result[DispatchNodeResponseKeyEnum.nodeResponse].loopRunHistory).toEqual([]);
  });

  it('lastInteractive 恢复 → 从中断轮次续跑, 保留已累积 loopHistory', async () => {
    // Resume at iteration 2 (0-based index 1). Prior history has 1 success entry.
    // The mocked runWorkflow returns success with break for iteration 2.
    runWorkflowMock.mockImplementationOnce(() =>
      Promise.resolve(
        makeDispatchFlowResponse({
          flowResponses: [
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
      variables: {},
      usagePush: vi.fn(),
      lastInteractive: {
        type: 'loopRunInteractive',
        params: {
          loopHistory: priorHistory,
          iteration: 2,
          childrenResponse: { entryNodeIds: ['userSelectNode'] }
        }
      }
    } as any;

    const result: any = await dispatchLoopRun(props);

    // Only one runWorkflow call: iteration 2 — then break terminates.
    expect(runWorkflowMock).toHaveBeenCalledTimes(1);
    const history = result[DispatchNodeResponseKeyEnum.nodeResponse].loopRunHistory;
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({ iteration: 1, success: true });
    expect(history[1]).toMatchObject({ iteration: 2, success: true });
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
          flowResponses: [makeResponseItem('startNode'), makeResponseItem('chatNode')]
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
      variables: {},
      usagePush: vi.fn(),
      lastInteractive: {
        type: 'loopRunInteractive',
        params: {
          loopHistory: priorHistory,
          iteration: 2,
          childrenResponse: interactivePayload
        }
      }
    } as any;

    await dispatchLoopRun(props);

    expect(runWorkflowMock).toHaveBeenCalledTimes(2);

    const resumeCall = runWorkflowMock.mock.calls[0][0];
    expect(resumeCall.lastInteractive).toBe(interactivePayload);

    const nextCall = runWorkflowMock.mock.calls[1][0];
    expect(nextCall.lastInteractive).toBeUndefined();
    expect(nextCall.runtimeEdges).toEqual([]);
  });

  it('array mode 输入非数组 → reject', async () => {
    const props = makeProps({
      [NodeInputKeyEnum.loopRunMode]: LoopRunModeEnum.array,
      [NodeInputKeyEnum.loopRunInputArray]: 'not-array' as any,
      [NodeInputKeyEnum.childrenNodeIdList]: ['startNode', 'chatNode']
    });
    await expect(dispatchLoopRun(props)).rejects.toMatch(/not an array/i);
  });

  it('array mode 数组长度超上限 → reject 预检查', async () => {
    const props = makeProps({
      [NodeInputKeyEnum.loopRunMode]: LoopRunModeEnum.array,
      [NodeInputKeyEnum.loopRunInputArray]: new Array(100).fill('x'),
      [NodeInputKeyEnum.childrenNodeIdList]: ['startNode', 'chatNode']
    });
    await expect(dispatchLoopRun(props)).rejects.toMatch(/greater than/i);
  });
});
