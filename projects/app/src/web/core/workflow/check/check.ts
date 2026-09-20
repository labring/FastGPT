import type { WorkflowModelCheckData } from '@fastgpt/global/core/workflow/model/type';
import type {
  WorkflowCheckNodeIssueMap,
  FlowNodeItemType
} from '@fastgpt/global/core/workflow/type/node';
import type { Edge, Node } from 'reactflow';
import type { TFunction } from 'next-i18next';
import type { AppChatConfigType } from '@fastgpt/global/core/app/type';
import { createWorkflowCheckContext, checkWorkflowNodeConnections } from './graph';
import { checkWorkflowNodeModelRules, checkWorkflowChatModelRules } from './model';
import { checkWorkflowNodeResourceRules, checkWorkflowNodeInputRules } from './node';
import { formatWorkflowRuleIssue } from './message';

/** 扫描节点规则，图索引只构造一次；输出顺序与画布、既有校验顺序一致。 */
export const checkWorkflowNodeIssues = ({
  nodes,
  edges,
  modelData,
  nodeId,
  variables,
  t
}: {
  nodes: Node<FlowNodeItemType, string | undefined>[];
  edges: Edge[];
  modelData?: WorkflowModelCheckData;
  nodeId?: string;
  variables?: AppChatConfigType['variables'];
  t?: TFunction;
}): WorkflowCheckNodeIssueMap => {
  // 1. 构造单次校验复用的图索引与可达性集合。
  const context = createWorkflowCheckContext({ nodes: nodes.map((node) => node.data), edges });
  const issueMap: WorkflowCheckNodeIssueMap = {};

  // 2. 按画布节点顺序汇总模型、资源、输入与连线规则，并在输出边界统一翻译。
  for (const { data } of nodes) {
    if (nodeId && data.nodeId !== nodeId) continue;

    const inputMap = new Map(data.inputs.map((input) => [input.key, input]));
    const models = checkWorkflowNodeModelRules({ data, inputMap, modelData });
    const issues = [
      ...models.customIssues,
      ...checkWorkflowNodeResourceRules({ data, inputMap, context }),
      ...models.systemIssues,
      ...checkWorkflowNodeInputRules({
        data,
        inputMap,
        context,
        variables,
        modelIssues: [...models.customIssues, ...models.systemIssues]
      }),
      ...checkWorkflowNodeConnections({ data, context })
    ];

    if (issues.length) {
      issueMap[data.nodeId] = issues.map((issue) =>
        formatWorkflowRuleIssue({ issue, node: data, t })
      );
    }
  }

  return issueMap;
};

/** 校验聊天配置模型并在输出边界补全提示文案。 */
export const checkWorkflowChatConfigModelIssues = ({
  chatConfig,
  modelData,
  t
}: {
  chatConfig?: AppChatConfigType;
  modelData?: WorkflowModelCheckData;
  t?: TFunction;
}) =>
  checkWorkflowChatModelRules({ chatConfig, modelData }).map((issue) =>
    formatWorkflowRuleIssue({ issue, t })
  );

/** 返回存在 error 的 nodeId 列表；传入 nodeOrder 时按画布节点顺序排列，便于稳定定位第一个错误节点。 */
export const getWorkflowCheckErrorNodeIds = (
  nodeIssueMap: WorkflowCheckNodeIssueMap,
  nodeOrder?: string[]
) => {
  const errorNodeIdSet = new Set(
    Object.entries(nodeIssueMap)
      .filter(([, issues]) => issues.some((issue) => issue.level === 'error'))
      .map(([nodeId]) => nodeId)
  );

  if (nodeOrder) {
    return nodeOrder.filter((nodeId) => errorNodeIdSet.has(nodeId));
  }

  return [...errorNodeIdSet];
};

/** 运行/发布前全量扫描，并按画布节点顺序返回第一个 error 节点。 */
export const checkWorkflowBeforeRunOrPublish = ({
  nodes,
  edges,
  modelData,
  t,
  chatConfig
}: {
  nodes: Node<FlowNodeItemType, string | undefined>[];
  edges: Edge[];
  modelData?: WorkflowModelCheckData;
  t?: TFunction;
  chatConfig?: AppChatConfigType;
}) => {
  const issueMap = checkWorkflowNodeIssues({
    nodes,
    edges,
    modelData,
    variables: chatConfig?.variables ?? [],
    t
  });
  const chatConfigIssues = checkWorkflowChatConfigModelIssues({ chatConfig, modelData, t });

  const nodeOrder = nodes.map((node) => node.data.nodeId);
  const errorNodeIds = getWorkflowCheckErrorNodeIds(issueMap, nodeOrder);
  const firstErrorNodeId = errorNodeIds[0];
  const firstErrorIssue = firstErrorNodeId
    ? issueMap[firstErrorNodeId]?.find((issue) => issue.level === 'error')
    : chatConfigIssues.find((issue) => issue.level === 'error');

  return {
    issueMap,
    hasError: errorNodeIds.length > 0 || chatConfigIssues.length > 0,
    firstErrorNodeId,
    firstErrorIssue,
    errorNodeIds,
    chatConfigIssues
  };
};
