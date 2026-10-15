import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import type { RuntimeEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { runWorkflow } from '@fastgpt/service/core/workflow/dispatch';
import { callbackMap } from '@fastgpt/service/core/workflow/dispatch/constants';
import { WorkflowVariableState } from '@fastgpt/service/core/workflow/dispatch/context/variables';


const langfuseMocks = vi.hoisted(() => ({
  onWorkflowNodeEnd: vi.fn()
}));

vi.mock('@fastgpt/service/common/langfuse/workflow', () => ({
  onWorkflowStart: vi.fn(),
  onWorkflowNodeStart: vi.fn(),
  onWorkflowNodeEnd: langfuseMocks.onWorkflowNodeEnd,
  onWorkflowEnd: vi.fn()
}));

const makeNode = (
  nodeId: string,
  flowNodeType: FlowNodeTypeEnum,
  { isEntry = false, marker }: { isEntry?: boolean; marker?: string } = {}
): RuntimeNodeItemType =>
  ({
    nodeId,
    name: nodeId,
    avatar: '',
    flowNodeType,
    showStatus: false,
    isEntry,
    catchError: false,
    inputs: marker
      ? [
          {
            key: 'marker',
            label: 'marker',
            value: marker,
            valueType: 'any' as WorkflowIOValueTypeEnum,
            renderTypeList: []
          }
        ]
      : [],
    outputs: []
  }) as RuntimeNodeItemType;

const makeEdge = (source: string, target: string): RuntimeEdgeItemType => ({
  source,
  target,
  sourceHandle: `${source}-source-right`,
  targetHandle: `${target}-target-left`,
  status: 'waiting'
});

const runWorkflowWithConcurrentAgents = async () => {
  const appId = '67e0d5535c02d1d5cdede721';
  const chatId = 'concurrent-agent-usage-chat';
  const responseChatItemId = 'concurrent-agent-usage-item';

  const runtimeNodes: RuntimeNodeItemType[] = [
    // 单个入口节点 fan-out 到两个 agent：入口完成后两个 agent 会同时进入队列，
    // 与线上并发节点的调度路径一致。
    makeNode('start', FlowNodeTypeEnum.textEditor, { isEntry: true }),
    makeNode('agent-a', FlowNodeTypeEnum.agent, { marker: 'a' }),
    makeNode('agent-b', FlowNodeTypeEnum.agent, { marker: 'b' })
  ];
  const runtimeEdges = [makeEdge('start', 'agent-a'), makeEdge('start', 'agent-b')];

  const variableState = await WorkflowVariableState.create({
    timezone: 'Asia/Shanghai',
    runningAppInfo: {
      id: appId,
      name: 'Concurrent agent app',
      teamId: '654a4107c32f3bf5f998452f',
      tmbId: '65ab7007462ada7dbb899948'
    },
    uid: 'test-user',
    chatId,
    responseChatItemId,
    histories: [],
    variablesConfig: [],
    inputVariables: {},
    externalVariables: {}
  });

  await runWorkflow({
    apiVersion: 'v2',
    mode: 'chat',
    chatId,
    responseChatItemId,
    runningAppInfo: {
      id: appId,
      name: 'Concurrent agent app',
      teamId: '654a4107c32f3bf5f998452f',
      tmbId: '65ab7007462ada7dbb899948'
    },
    runningUserInfo: {
      teamId: '654a4107c32f3bf5f998452f',
      tmbId: '65ab7007462ada7dbb899948',
      teamName: 'team',
      memberName: 'member',
      contact: '',
      username: 'user'
    },
    uid: 'test-user',
    lang: 'zh-CN',
    histories: [],
    query: [{ type: 'text', text: { content: 'run concurrent agents' } }],
    variables: {},
    chatConfig: {},
    runtimeNodes,
    runtimeEdges,
    variableState,
    externalProvider: {},
    workflowDispatchDeep: 0,
    maxRunTimes: 20,
    stream: false,
    responseAllData: true,
    responseDetail: true,
    checkIsStopping: () => false
  } as any);
};

describe('Node usage isolation under workflow concurrency', () => {
  const originalAgentDispatch = callbackMap[FlowNodeTypeEnum.agent];
  const originalTextEditorDispatch = callbackMap[FlowNodeTypeEnum.textEditor];

  afterEach(() => {
    callbackMap[FlowNodeTypeEnum.agent] = originalAgentDispatch;
    callbackMap[FlowNodeTypeEnum.textEditor] = originalTextEditorDispatch;
    vi.clearAllMocks();
  });

  it('attributes pushed usage to the executing node when agents run concurrently', async () => {
    callbackMap[FlowNodeTypeEnum.textEditor] = vi.fn(async () => ({ data: {} })) as never;

    // 两个 agent 必须同时进入 dispatch：用一个双方都到达才放行的栅栏，
    // 串行执行会在这里超时，从而证明本用例确实覆盖了并发场景。
    let started = 0;
    let releaseGate!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });

    callbackMap[FlowNodeTypeEnum.agent] = vi.fn(
      async ({
        node,
        usagePush
      }: {
        node: RuntimeNodeItemType;
        usagePush: (usages: any[]) => void;
      }) => {
        const isA = node.nodeId === 'agent-a';
        usagePush([
          {
            moduleName: 'agent',
            modelId: 'mock-model',
            inputTokens: isA ? 10 : 100,
            outputTokens: isA ? 20 : 200,
            totalPoints: 0
          }
        ]);

        started += 1;
        if (started === 2) releaseGate();
        await gate;

        return { data: {} };
      }
    ) as typeof callbackMap[typeof FlowNodeTypeEnum.agent];

    await runWorkflowWithConcurrentAgents();

    expect(started).toBe(2);

    const usageByMarker = Object.fromEntries(
      langfuseMocks.onWorkflowNodeEnd.mock.calls
        // 入口节点没有 marker，只校验两个 agent 节点。
        .filter(([args]) => typeof args.input?.marker === 'string')
        .map(([args]) => [args.input.marker, args.usage])
    );

    // 并发节点只能看到自己 push 的 usage，不能混入另一个节点的 token。
    expect(usageByMarker).toEqual({
      a: { inputTokens: 10, outputTokens: 20 },
      b: { inputTokens: 100, outputTokens: 200 }
    });
  });
});
