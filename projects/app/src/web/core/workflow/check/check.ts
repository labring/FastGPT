import type { WorkflowModelCheckData } from '@fastgpt/global/core/workflow/model/type';
import type {
  WorkflowCheckNodeIssueMap,
  FlowNodeItemType,
  WorkflowCheckIssue
} from '@fastgpt/global/core/workflow/type/node';
import type { AppChatConfigType } from '@fastgpt/global/core/app/type';
import { moduleTemplatesFlat } from '@fastgpt/global/core/workflow/template/constants';
import { validateWorkflow } from '@fastgpt/workflow-core/validation';
import { checkWorkflowModels } from '@fastgpt/workflow-core/validation/model';
import { collectWorkflowBindings } from '@fastgpt/workflow-core/binding/service';
import type { WorkflowBindingRequirement } from '@fastgpt/workflow-core/binding/type';
import type { WorkflowDiagnostic } from '@fastgpt/workflow-core/domain/diagnostic';
import type { Edge, Node } from 'reactflow';
import type { TFunction } from 'next-i18next';
import { createWorkflowCheckDocument } from './document';
import { formatWorkflowDiagnostic } from './diagnostic';
import { checkWorkflowNodeResourceRules } from './resource';
import { formatWorkflowRuleIssue } from './message';

type WorkflowCheckInput = {
  nodes: Node<FlowNodeItemType, string | undefined>[];
  edges: Edge[];
  modelData?: WorkflowModelCheckData;
  nodeId?: string;
  t?: TFunction;
  chatConfig?: AppChatConfigType;
};

/**
 * 所有 Web 场景共用一次 Core 扫描；Web 只补资源状态和展示，不维护另一套输入、模型或图规则。
 * 无节点归属的诊断单独保留，避免“已阻断但没有具体提示”；原始诊断原样返回供调用方排查。
 */
const checkWorkflow = ({ nodes, edges, modelData, nodeId, t, chatConfig }: WorkflowCheckInput) => {
  const projected = createWorkflowCheckDocument({ nodes, edges, chatConfig });
  const diagnostics = [
    ...projected.diagnostics,
    ...validateWorkflow(projected.document, {
      modelCheck: { modelData, templates: moduleTemplatesFlat }
    })
  ];
  const nodeMap = new Map(nodes.map(({ data }) => [data.nodeId, data]));
  const issueEntries = new Map<string, { issue: WorkflowCheckIssue; order: number }[]>();
  const chatConfigIssues: WorkflowCheckIssue[] = [];
  const workflowIssues: WorkflowCheckIssue[] = [];

  /** 只做诊断定位：节点、schema 路径、连线两端分别归属；不在 Web 重跑任何图规则。 */
  const getOwners = (diagnostic: WorkflowDiagnostic) => {
    if (diagnostic.nodeId && nodeMap.has(diagnostic.nodeId)) return [diagnostic.nodeId];
    if (diagnostic.path?.[0] === 'nodes' && typeof diagnostic.path[1] === 'number') {
      const owner = nodes[diagnostic.path[1]]?.data.nodeId;
      if (owner) return [owner];
    }
    const edge = diagnostic.params?.edge as
      | {
          source?: string | { nodeId?: string };
          target?: string | { nodeId?: string };
        }
      | undefined;
    if (!edge) return [];
    return [
      ...new Set(
        [edge.source, edge.target].map((port) => (typeof port === 'string' ? port : port?.nodeId))
      )
    ].filter((id): id is string => !!id && nodeMap.has(id));
  };
  for (const diagnostic of diagnostics) {
    const owners = getOwners(diagnostic);
    if (owners.length === 0) {
      const issue = formatWorkflowDiagnostic({ diagnostic, t });
      (diagnostic.path?.[0] === 'chatConfig' ? chatConfigIssues : workflowIssues).push(issue);
      continue;
    }
    const isModel = diagnostic.code.startsWith('WORKFLOW_MODEL_');
    const isConnection =
      diagnostic.code === 'WORKFLOW_NODE_ISOLATED' ||
      diagnostic.code === 'WORKFLOW_NODE_NOT_REACHABLE';
    const order = isModel ? (diagnostic.params?.customSelector ? 0 : 2) : isConnection ? 4 : 3;
    for (const owner of owners) {
      if (nodeId && owner !== nodeId) continue;
      const entries = issueEntries.get(owner) ?? [];
      entries.push({
        issue: formatWorkflowDiagnostic({ diagnostic, node: nodeMap.get(owner), t }),
        order
      });
      issueEntries.set(owner, entries);
    }
  }

  const bindingsByNode = new Map<string, WorkflowBindingRequirement[]>();
  for (const binding of collectWorkflowBindings(projected.document)) {
    const bindings = bindingsByNode.get(binding.nodeId) ?? [];
    bindings.push(binding);
    bindingsByNode.set(binding.nodeId, bindings);
  }
  for (const { data } of nodes) {
    if (nodeId && nodeId !== data.nodeId) continue;
    const entries = issueEntries.get(data.nodeId) ?? [];
    entries.push(
      ...checkWorkflowNodeResourceRules({
        data,
        bindings: bindingsByNode.get(data.nodeId) ?? []
      }).map((issue) => ({
        issue: formatWorkflowRuleIssue({ issue, node: data, t }),
        order: 1
      }))
    );
    issueEntries.set(data.nodeId, entries);
  }

  /** 展示去重不丢原始诊断：连线的两端可各自定位，toast 再按具体文案去重。 */
  const uniqueIssues = (issues: WorkflowCheckIssue[]) => {
    const seen = new Set<string>();
    return issues.filter((issue) => {
      const key = JSON.stringify([issue.code, issue.inputKey, issue.level, issue.message]);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };
  const issueMap: WorkflowCheckNodeIssueMap = {};
  for (const { data } of nodes) {
    const entries = issueEntries.get(data.nodeId) ?? [];
    const issues = uniqueIssues(
      entries.sort((left, right) => left.order - right.order).map(({ issue }) => issue)
    );
    if (issues.length > 0) issueMap[data.nodeId] = issues;
  }
  return {
    issueMap,
    chatConfigIssues: uniqueIssues(chatConfigIssues),
    workflowIssues: uniqueIssues(workflowIssues),
    diagnostics
  };
};

/** 编辑提示和单节点刷新复用完整图上下文，结果只返回请求节点的问题，不影响保存。 */
export const checkWorkflowNodeIssues = (input: WorkflowCheckInput): WorkflowCheckNodeIssueMap =>
  checkWorkflow(input).issueMap;

/** 独立聊天配置消费者复用 Core 模型检查；运行/发布主流程不会再额外调用本函数。 */
export const checkWorkflowChatConfigModelIssues = ({
  chatConfig = {},
  modelData,
  t
}: {
  chatConfig?: AppChatConfigType;
  modelData?: WorkflowModelCheckData;
  t?: TFunction;
}) => {
  const { document } = createWorkflowCheckDocument({ nodes: [], edges: [], chatConfig });
  return checkWorkflowModels({ document, modelData, templates: moduleTemplatesFlat }).map(
    (diagnostic) => formatWorkflowDiagnostic({ diagnostic, t })
  );
};

/** 按画布顺序定位 error 节点；warning 保留展示但不阻断。 */
export const getWorkflowCheckErrorNodeIds = (
  nodeIssueMap: WorkflowCheckNodeIssueMap,
  nodeOrder?: string[]
) => {
  const ids = new Set(
    Object.keys(nodeIssueMap).filter((id) =>
      nodeIssueMap[id].some((issue) => issue.level === 'error')
    )
  );
  return nodeOrder ? nodeOrder.filter((id) => ids.has(id)) : [...ids];
};

/** 运行、聊天、发布的统一入口；Core 静态/模型 + Web 资源只各执行一次，所有错误共用一套展示结果。 */
export const checkWorkflowBeforeRunOrPublish = (input: WorkflowCheckInput) => {
  const result = checkWorkflow(input);
  const errorNodeIds = getWorkflowCheckErrorNodeIds(
    result.issueMap,
    input.nodes.map(({ data }) => data.nodeId)
  );
  const firstErrorNodeId = errorNodeIds[0];
  const allIssues = [
    ...Object.values(result.issueMap).flat(),
    ...result.chatConfigIssues,
    ...result.workflowIssues
  ];
  const errors = allIssues.filter((issue) => issue.level === 'error');
  return {
    ...result,
    hasError: errors.length > 0,
    firstErrorNodeId,
    firstErrorIssue: firstErrorNodeId
      ? result.issueMap[firstErrorNodeId].find((issue) => issue.level === 'error')
      : errors[0],
    errorNodeIds,
    errorMessages: [...new Set(errors.map((issue) => issue.message))]
  };
};
