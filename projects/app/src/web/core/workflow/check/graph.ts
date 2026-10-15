import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import {
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  VARIABLE_NODE_ID
} from '@fastgpt/global/core/workflow/constants';
import {
  getHandleId,
  isValidReferenceValueFormat
} from '@fastgpt/global/common/workflow/reference';
import type { StoreEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import type { WorkflowRuleIssue } from '@/web/core/workflow/type';

export type WorkflowCheckEdge = Pick<StoreEdgeItemType, 'source' | 'target'> & {
  sourceHandle?: StoreEdgeItemType['sourceHandle'] | null;
  targetHandle?: StoreEdgeItemType['targetHandle'] | null;
};

export type WorkflowCheckContext = {
  nodeMap: Map<string, FlowNodeItemType>;
  nodeOutputMap: Map<string, Set<string>>;
  incomingEdgesMap: Map<string, WorkflowCheckEdge[]>;
  outgoingEdgesMap: Map<string, WorkflowCheckEdge[]>;
  reachableNodeSet: Set<string>;
};

const workflowCheckSkipConnectionTypes = new Set<FlowNodeTypeEnum>([
  FlowNodeTypeEnum.comment,
  FlowNodeTypeEnum.globalVariable,
  FlowNodeTypeEnum.emptyNode
]);

const workflowCheckStartTypes = new Set<FlowNodeTypeEnum>([
  FlowNodeTypeEnum.workflowStart,
  FlowNodeTypeEnum.pluginInput,
  FlowNodeTypeEnum.nestedStart,
  FlowNodeTypeEnum.loopRunStart
]);

/** 构造本次校验的图索引，悬空分支连线不会参与可达性计算。 */
export const createWorkflowCheckContext = ({
  nodes,
  edges
}: {
  nodes: FlowNodeItemType[];
  edges: WorkflowCheckEdge[];
}): WorkflowCheckContext => {
  /**
   * 多分支节点的 sourceHandle 必须与当前 options/agents 中的 key 一致；
   * 删除分支后残留的悬空 edge 不应计入有效连线。
   */
  const isWorkflowEdgeSourceHandleValid = (
    sourceNode: FlowNodeItemType | undefined,
    sourceHandle: string | null | undefined
  ) => {
    if (!sourceNode) return false;

    const { nodeId, flowNodeType, inputs } = sourceNode;

    const branchInputKey = (() => {
      if (flowNodeType === FlowNodeTypeEnum.userSelect) {
        return NodeInputKeyEnum.userSelectOptions;
      }
      if (flowNodeType === FlowNodeTypeEnum.classifyQuestion) {
        return NodeInputKeyEnum.agents;
      }
      return undefined;
    })();
    if (!branchInputKey) return true;
    if (!sourceHandle) return false;
    const branches = inputs.find((input) => input.key === branchInputKey)?.value as
      | Array<{ key?: string }>
      | undefined;
    return (
      Array.isArray(branches) &&
      branches.some(
        (branch) => branch.key && sourceHandle === getHandleId(nodeId, 'source', branch.key)
      )
    );
  };

  const nodeMap = new Map<string, FlowNodeItemType>();
  const nodeOutputMap = new Map<string, Set<string>>();
  const incomingEdgesMap = new Map<string, WorkflowCheckEdge[]>();
  const outgoingEdgesMap = new Map<string, WorkflowCheckEdge[]>();

  nodes.forEach((node) => {
    nodeMap.set(node.nodeId, node);
    nodeOutputMap.set(node.nodeId, new Set(node.outputs.map((output) => output.id)));
    incomingEdgesMap.set(node.nodeId, []);
    outgoingEdgesMap.set(node.nodeId, []);
  });

  edges.forEach((edge) => {
    const sourceNode = nodeMap.get(edge.source);
    if (!isWorkflowEdgeSourceHandleValid(sourceNode, edge.sourceHandle)) {
      return;
    }

    outgoingEdgesMap.get(edge.source)?.push(edge);
    incomingEdgesMap.get(edge.target)?.push(edge);
  });

  const reachableNodeSet = new Set<string>();
  const visit = (nodeId: string) => {
    if (reachableNodeSet.has(nodeId)) return;
    reachableNodeSet.add(nodeId);

    outgoingEdgesMap.get(nodeId)?.forEach((edge) => visit(edge.target));
  };

  nodes.forEach((node) => {
    if (workflowCheckStartTypes.has(node.flowNodeType)) {
      visit(node.nodeId);
    }
  });

  return {
    nodeMap,
    nodeOutputMap,
    incomingEdgesMap,
    outgoingEdgesMap,
    reachableNodeSet
  };
};

/** 引用目标必须仍有对应输出；全局变量不依赖普通节点输出表。 */
export const referenceValueIsLive = (value: unknown, context: WorkflowCheckContext) => {
  if (!isValidReferenceValueFormat(value)) return false;
  const [refNodeId, refOutputId] = value;
  if (!refNodeId || !refOutputId) return false;
  if (refNodeId === VARIABLE_NODE_ID) return true;

  return context.nodeOutputMap.get(refNodeId)?.has(refOutputId) === true;
};

/** 检查节点连线与入口可达性，复用本次扫描建立的图索引。 */
export const checkWorkflowNodeConnections = ({
  data,
  context
}: {
  data: FlowNodeItemType;
  context: WorkflowCheckContext;
}): WorkflowRuleIssue[] => {
  const issues: WorkflowRuleIssue[] = [];
  if (!workflowCheckSkipConnectionTypes.has(data.flowNodeType)) {
    const isStartNode = workflowCheckStartTypes.has(data.flowNodeType);
    const incomingEdges = context.incomingEdgesMap.get(data.nodeId) ?? [];
    const outgoingEdges = context.outgoingEdgesMap.get(data.nodeId) ?? [];
    const meaningfulOutgoingEdges =
      data.flowNodeType === FlowNodeTypeEnum.toolCall
        ? outgoingEdges.filter((edge) => edge.sourceHandle !== NodeOutputKeyEnum.selectedTools)
        : outgoingEdges;
    const hasAnyMeaningfulEdge = incomingEdges.length > 0 || meaningfulOutgoingEdges.length > 0;

    if (!isStartNode && incomingEdges.length === 0) {
      issues.push({ code: 'no_upstream' });
    } else if (!isStartNode && !context.reachableNodeSet.has(data.nodeId)) {
      issues.push({ code: 'unreachable_from_start' });
    } else if (!hasAnyMeaningfulEdge) {
      issues.push({ code: 'isolated_node' });
    }
  }
  return issues;
};
