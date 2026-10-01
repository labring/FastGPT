import type { WorkflowDocument } from '../domain/document';
import { WorkflowCommandError } from '../domain/diagnostic';
import { compileExecutionEdge } from './compiler';
import type { WorkflowExecutionEdge } from './type';
import type { ExecutionSourcePortRef } from './type';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { IfElseResultEnum } from '@fastgpt/global/core/workflow/template/system/ifElse/constant';
import { getIfElseBranchHandleKey } from '@fastgpt/global/core/workflow/template/system/ifElse/utils';
import type { IfElseListItemType } from '@fastgpt/global/core/workflow/template/system/ifElse/type';
import { getDocumentNode } from '../nesting/service';
import { NODE_TYPES_WITHOUT_NEXT_PORT, TOOL_TARGET_NODE_TYPES } from '../template/contract';

const edgeEquals = (left: WorkflowExecutionEdge, right: WorkflowExecutionEdge) =>
  JSON.stringify(left) === JSON.stringify(right);

/** 返回节点在 insert 场景下用于承接旧 target 的默认执行出口。 */
export const getDefaultExecutionSourcePort = (
  document: WorkflowDocument,
  nodeId: string
): ExecutionSourcePortRef => {
  const node = getDocumentNode(document, nodeId);
  if (node.flowNodeType === FlowNodeTypeEnum.ifElseNode) {
    return { kind: 'branch', nodeId, branchKey: IfElseResultEnum.ELSE };
  }
  if (
    node.flowNodeType === FlowNodeTypeEnum.userSelect ||
    node.flowNodeType === FlowNodeTypeEnum.classifyQuestion
  ) {
    const inputKey =
      node.flowNodeType === FlowNodeTypeEnum.userSelect
        ? NodeInputKeyEnum.userSelectOptions
        : NodeInputKeyEnum.agents;
    const options = node.inputs.find((item) => item.key === inputKey)?.value;
    const branchKey =
      Array.isArray(options) && options[0] && typeof options[0].key === 'string'
        ? options[0].key
        : undefined;
    if (branchKey) return { kind: 'branch', nodeId, branchKey };
  }
  if (NODE_TYPES_WITHOUT_NEXT_PORT.has(node.flowNodeType)) {
    throw new WorkflowCommandError([
      { code: 'WORKFLOW_NODE_HAS_NO_DEFAULT_SOURCE_PORT', severity: 'error', nodeId }
    ]);
  }
  return { kind: 'next', nodeId };
};

const assertBranchKey = (document: WorkflowDocument, edge: WorkflowExecutionEdge) => {
  if (edge.source.kind !== 'branch') return;
  const node = getDocumentNode(document, edge.source.nodeId);
  const inputKey =
    node.flowNodeType === FlowNodeTypeEnum.ifElseNode
      ? NodeInputKeyEnum.ifElseList
      : node.flowNodeType === FlowNodeTypeEnum.userSelect
        ? NodeInputKeyEnum.userSelectOptions
        : NodeInputKeyEnum.agents;
  const value = node.inputs.find((item) => item.key === inputKey)?.value;
  const keys = (() => {
    if (!Array.isArray(value)) return [];
    if (node.flowNodeType === FlowNodeTypeEnum.ifElseNode) {
      return [
        ...value.map((item, index) => getIfElseBranchHandleKey(item as IfElseListItemType, index)),
        IfElseResultEnum.ELSE
      ];
    }
    return value
      .map((item) =>
        item && typeof item === 'object' ? (item as { key?: unknown }).key : undefined
      )
      .filter((item): item is string => typeof item === 'string');
  })();
  if (!keys.includes(edge.source.branchKey)) {
    throw new WorkflowCommandError([
      {
        code: 'WORKFLOW_BRANCH_KEY_NOT_FOUND',
        severity: 'error',
        nodeId: edge.source.nodeId,
        params: { branchKey: edge.source.branchKey }
      }
    ]);
  }
};

/** 校验复杂执行边的端口配对、作用域和节点能力。 */
export const assertExecutionEdge = (document: WorkflowDocument, edge: WorkflowExecutionEdge) => {
  const sourceNode = getDocumentNode(document, edge.source.nodeId);
  const targetNode = getDocumentNode(document, edge.target.nodeId);
  if (sourceNode.nodeId === targetNode.nodeId) {
    throw new WorkflowCommandError([
      { code: 'WORKFLOW_EDGE_SELF_CONNECTION', severity: 'error', nodeId: sourceNode.nodeId }
    ]);
  }
  if (sourceNode.parentNodeId !== targetNode.parentNodeId) {
    throw new WorkflowCommandError([
      { code: 'WORKFLOW_EDGE_CROSS_SCOPE', severity: 'error', params: { edge } }
    ]);
  }
  const sourceIsTool = edge.source.kind === 'selectedTools';
  const targetIsTool = edge.target.kind === 'selectedTools';
  if (sourceIsTool !== targetIsTool) {
    throw new WorkflowCommandError([
      { code: 'WORKFLOW_TOOL_EDGE_INVALID', severity: 'error', params: { edge } }
    ]);
  }
  if (sourceIsTool) {
    if (
      sourceNode.flowNodeType !== FlowNodeTypeEnum.toolCall ||
      !TOOL_TARGET_NODE_TYPES.has(targetNode.flowNodeType)
    ) {
      throw new WorkflowCommandError([
        { code: 'WORKFLOW_TOOL_EDGE_NODE_INVALID', severity: 'error', params: { edge } }
      ]);
    }
  } else if (edge.target.kind !== 'target') {
    throw new WorkflowCommandError([
      { code: 'WORKFLOW_EDGE_TARGET_KIND_INVALID', severity: 'error', params: { edge } }
    ]);
  }
  if (edge.source.kind === 'catch' && sourceNode.catchError !== true) {
    throw new WorkflowCommandError([
      { code: 'WORKFLOW_CATCH_NOT_ENABLED', severity: 'error', nodeId: sourceNode.nodeId }
    ]);
  }
  if (edge.source.kind === 'next' && NODE_TYPES_WITHOUT_NEXT_PORT.has(sourceNode.flowNodeType)) {
    throw new WorkflowCommandError([
      {
        code: 'WORKFLOW_NEXT_PORT_UNSUPPORTED',
        severity: 'error',
        nodeId: sourceNode.nodeId
      }
    ]);
  }
  assertBranchKey(document, edge);
  compileExecutionEdge(edge, document);
};

export const connectExecutionEdge = ({
  document,
  edge
}: {
  document: WorkflowDocument;
  edge: WorkflowExecutionEdge;
}) => {
  assertExecutionEdge(document, edge);
  if (document.executionEdges.some((item) => edgeEquals(item, edge))) {
    throw new WorkflowCommandError([
      { code: 'WORKFLOW_EDGE_DUPLICATED', severity: 'error', params: { edge } }
    ]);
  }
  document.executionEdges.push(edge);
};

export const disconnectExecutionEdge = ({
  document,
  edge
}: {
  document: WorkflowDocument;
  edge: WorkflowExecutionEdge;
}) => {
  const index = document.executionEdges.findIndex((item) => edgeEquals(item, edge));
  if (index < 0) {
    throw new WorkflowCommandError([
      { code: 'WORKFLOW_EDGE_NOT_FOUND', severity: 'error', params: { edge } }
    ]);
  }
  document.executionEdges.splice(index, 1);
};

/** 先校验新边，再移除旧边，保证重连不会留下半成品。 */
export const reconnectExecutionEdge = ({
  document,
  oldEdge,
  newEdge
}: {
  document: WorkflowDocument;
  oldEdge: WorkflowExecutionEdge;
  newEdge: WorkflowExecutionEdge;
}) => {
  assertExecutionEdge(document, newEdge);
  if (document.executionEdges.some((item) => edgeEquals(item, newEdge))) {
    throw new WorkflowCommandError([
      { code: 'WORKFLOW_EDGE_DUPLICATED', severity: 'error', params: { edge: newEdge } }
    ]);
  }
  disconnectExecutionEdge({ document, edge: oldEdge });
  document.executionEdges.push(newEdge);
};
