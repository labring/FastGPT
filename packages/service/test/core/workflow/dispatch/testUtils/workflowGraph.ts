import { vi } from 'vitest';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import type {
  FlowNodeInputItemType,
  FlowNodeOutputItemType
} from '@fastgpt/global/core/workflow/type/io';
import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  type FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import type { RuntimeEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import type { RunWorkflowProps } from '@fastgpt/service/core/workflow/dispatch';
import { prepareWorkflowFileContext } from '@fastgpt/service/core/workflow/utils/fileContext';
import { runWithContext } from '@fastgpt/service/core/workflow/utils/context';
import { WorkflowVariableState } from '@fastgpt/service/core/workflow/dispatch/utils/variables';

/** 构造最小节点声明，输出默认使用 any，避免测试构造器提前改变待验证的数据。 */
export const graphNode = ({
  id,
  type,
  params = {},
  inputs = [],
  outputs = [],
  ...rest
}: {
  id: string;
  type: FlowNodeTypeEnum;
  params?: Record<string, unknown>;
  inputs?: FlowNodeInputItemType[];
  outputs?: Array<string | FlowNodeOutputItemType>;
} & Omit<Partial<RuntimeNodeItemType>, 'inputs' | 'outputs'>): RuntimeNodeItemType => ({
  nodeId: id,
  name: id,
  avatar: '',
  flowNodeType: type,
  inputs: [
    ...Object.entries(params).map(([key, value]) => ({
      key,
      value,
      label: key,
      renderTypeList: [FlowNodeInputTypeEnum.input],
      valueType: WorkflowIOValueTypeEnum.any
    })),
    ...inputs
  ],
  outputs: outputs.map((output) =>
    typeof output === 'string'
      ? {
          id: output,
          key: output,
          label: output,
          type: FlowNodeOutputTypeEnum.static,
          valueType: WorkflowIOValueTypeEnum.any
        }
      : output
  ),
  ...rest
});

/** 声明生产引用输入，引用解析交给真实 Queue 执行。 */
export const graphReference = ({
  key,
  from,
  valueType = WorkflowIOValueTypeEnum.any
}: {
  key: string;
  from: [string, string] | [string, string][];
  valueType?: WorkflowIOValueTypeEnum;
}): FlowNodeInputItemType => ({
  key,
  label: key,
  value: from,
  renderTypeList: [FlowNodeInputTypeEnum.reference],
  valueType
});

/** 普通边和错误边均使用生产 handle 约定。 */
export const graphEdge = ({
  source,
  target,
  handle = 'right',
  error = false
}: {
  source: string;
  target: string;
  handle?: string;
  error?: boolean;
}): RuntimeEdgeItemType => ({
  source,
  target,
  sourceHandle: error ? `${source}-source_catch-right` : `${source}-source-${handle}`,
  targetHandle: `${target}-target-left`,
  status: 'waiting'
});

/** 从真实节点执行后被 Queue 写入的 outputs 中读取结果。 */
export const graphValues = (node: RuntimeNodeItemType) =>
  Object.fromEntries(node.outputs.map((output) => [output.key, output.value]));

/**
 * 一次运行完整最小工作流；不替换 callbackMap、不回放节点结果。
 * 真实节点、子工作流、引用、分支和 summary 均参与执行。sink 仅收集响应，便于验证序列化边界。
 */
export const runGraph = async ({
  nodes,
  edges = [],
  overrides = {}
}: {
  nodes: RuntimeNodeItemType[];
  edges?: RuntimeEdgeItemType[];
  overrides?: Partial<RunWorkflowProps>;
}) => {
  // 节点单测可以 mock 子工作流调用，但共享 graph 始终运行真实调度层。
  const { runWorkflow } = await vi.importActual<
    typeof import('@fastgpt/service/core/workflow/dispatch')
  >('@fastgpt/service/core/workflow/dispatch');
  const responses: ChatHistoryItemResType[] = [];
  const publish = vi.fn(async (items: Array<{ response: ChatHistoryItemResType }>) => {
    responses.push(...items.map((item) => item.response));
    return items.map((item) => item.response);
  });
  const runningAppInfo: RunWorkflowProps['runningAppInfo'] = {
    sourceType: ChatSourceTypeEnum.app,
    sourceId: '67e0d5535c02d1d5cdede721',
    name: 'workflow regression',
    teamId: '654a4107c32f3bf5f998452f',
    tmbId: '65ab7007462ada7dbb899948'
  };
  const variableState =
    overrides.variableState ??
    (await WorkflowVariableState.create({
      timezone: 'Asia/Shanghai',
      runningAppInfo,
      uid: 'workflow-regression',
      chatId: 'workflow-chat',
      histories: [],
      variablesConfig: []
    }));
  const { fileContext, fileRegistrar } = await prepareWorkflowFileContext({
    query: overrides.query ?? [],
    histories: overrides.histories ?? [],
    scope: {
      sourceType: ChatSourceTypeEnum.app,
      sourceId: runningAppInfo.sourceId,
      uid: 'workflow-regression',
      chatId: 'workflow-chat'
    },
    maxFileAmount: 20
  });
  const result = await runWithContext({ mcpClientMemory: {}, fileContext, fileRegistrar }, () =>
    runWorkflow({
      apiVersion: 'v2',
      mode: 'chat',
      timezone: 'Asia/Shanghai',
      lang: 'zh-CN',
      runningAppInfo,
      runningUserInfo: {
        teamId: runningAppInfo.teamId,
        tmbId: runningAppInfo.tmbId,
        username: 'regression',
        teamName: 'team',
        memberName: 'member',
        contact: ''
      },
      uid: 'workflow-regression',
      chatId: 'workflow-chat',
      responseChatItemId: 'workflow-response',
      stream: false,
      histories: [],
      query: [],
      chatConfig: {},
      externalProvider: {},
      maxRunTimes: 100,
      workflowDispatchDeep: 0,
      checkIsStopping: () => false,
      ...overrides,
      variableState,
      runtimeNodes: nodes,
      runtimeEdges: edges,
      // 与生产 sink 一样接管明细，Queue 不再重复保留 responseData。
      nodeResponseSink: { publish, hasOutput: true }
    })
  );
  return { result, responses, publish, variableState };
};
