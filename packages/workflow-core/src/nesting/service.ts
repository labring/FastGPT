import { WorkflowDiagnosticCodeEnum } from '@fastgpt/global/core/workflow/diagnostic/constants';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeTypeEnum,
  isInteractiveNodeType,
  isNestedChildSystemNodeType,
  isNestedParentNodeType
} from '@fastgpt/global/core/workflow/node/constant';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import type { WorkflowDocument } from '@fastgpt/global/core/workflow/type/document';
import { WorkflowCommandError } from '../domain/diagnostic';
import { ROOT_ONLY_NODE_TYPES } from '../template/contract';

export const getDocumentNode = (document: WorkflowDocument, nodeId: string) => {
  const node = document.nodes.find((item) => item.nodeId === nodeId);
  if (!node) {
    throw new WorkflowCommandError([
      { code: WorkflowDiagnosticCodeEnum.nodeNotFound, severity: 'error', nodeId }
    ]);
  }
  return node;
};

/** 以 parentNodeId 为事实源，同步容器的 childrenNodeIdList 兼容字段。 */
export const syncContainerChildren = (document: WorkflowDocument, parentNodeId: string) => {
  const parent = getDocumentNode(document, parentNodeId);
  const input = parent.inputs.find((item) => item.key === NodeInputKeyEnum.childrenNodeIdList);
  if (input) {
    input.value = document.nodes
      .filter((item) => item.parentNodeId === parentNodeId)
      .map((item) => item.nodeId);
  }
};

/** 校验节点是否可以处于指定容器；undefined 表示根级。 */
export const assertParentAssignment = ({
  document,
  node,
  parentNodeId,
  allowSystemChild = false
}: {
  document: WorkflowDocument;
  node: StoreNodeItemType;
  parentNodeId?: string;
  allowSystemChild?: boolean;
}) => {
  if (!parentNodeId) {
    if (node.flowNodeType === FlowNodeTypeEnum.loopRunBreak) {
      throw new WorkflowCommandError([
        {
          code: WorkflowDiagnosticCodeEnum.loopBreakParentRequired,
          severity: 'error',
          nodeId: node.nodeId
        }
      ]);
    }
    if (isNestedChildSystemNodeType(node.flowNodeType) && !allowSystemChild) {
      throw new WorkflowCommandError([
        {
          code: WorkflowDiagnosticCodeEnum.systemChildMoveForbidden,
          severity: 'error',
          nodeId: node.nodeId
        }
      ]);
    }
    return;
  }

  const parent = getDocumentNode(document, parentNodeId);
  if (!isNestedParentNodeType(parent.flowNodeType)) {
    throw new WorkflowCommandError([
      {
        code: WorkflowDiagnosticCodeEnum.parentNotContainer,
        severity: 'error',
        nodeId: node.nodeId,
        params: { parentNodeId }
      }
    ]);
  }
  if (ROOT_ONLY_NODE_TYPES.has(node.flowNodeType)) {
    throw new WorkflowCommandError([
      {
        code: WorkflowDiagnosticCodeEnum.nodeNotAllowedInContainer,
        severity: 'error',
        nodeId: node.nodeId,
        params: { parentNodeId }
      }
    ]);
  }
  if (
    parent.flowNodeType === FlowNodeTypeEnum.parallelRun &&
    isInteractiveNodeType(node.flowNodeType)
  ) {
    throw new WorkflowCommandError([
      {
        code: WorkflowDiagnosticCodeEnum.interactiveNodeNotAllowedInParallel,
        severity: 'error',
        nodeId: node.nodeId,
        params: { parentNodeId }
      }
    ]);
  }
  if (
    node.flowNodeType === FlowNodeTypeEnum.loopRunBreak &&
    parent.flowNodeType !== FlowNodeTypeEnum.loopRun
  ) {
    throw new WorkflowCommandError([
      {
        code: WorkflowDiagnosticCodeEnum.loopBreakParentInvalid,
        severity: 'error',
        nodeId: node.nodeId,
        params: { parentNodeId }
      }
    ]);
  }
  if (isNestedChildSystemNodeType(node.flowNodeType) && !allowSystemChild) {
    throw new WorkflowCommandError([
      {
        code: WorkflowDiagnosticCodeEnum.systemChildMoveForbidden,
        severity: 'error',
        nodeId: node.nodeId
      }
    ]);
  }
};

/** 改变父作用域时同步父子字段，并移除跨作用域执行边。 */
export const moveNodeToParent = ({
  document,
  nodeId,
  parentNodeId,
  position
}: {
  document: WorkflowDocument;
  nodeId: string;
  parentNodeId?: string;
  position?: { x: number; y: number };
}) => {
  const node = getDocumentNode(document, nodeId);
  const previousParentNodeId = node.parentNodeId;
  assertParentAssignment({ document, node, parentNodeId });

  node.parentNodeId = parentNodeId;
  if (position) node.position = position;

  let removedEdgeCount = 0;
  if (previousParentNodeId !== parentNodeId) {
    const before = document.executionEdges.length;
    document.executionEdges = document.executionEdges.filter(
      (edge) => edge.source.nodeId !== nodeId && edge.target.nodeId !== nodeId
    );
    removedEdgeCount = before - document.executionEdges.length;
    if (previousParentNodeId) syncContainerChildren(document, previousParentNodeId);
    if (parentNodeId) syncContainerChildren(document, parentNodeId);
  }

  return { previousParentNodeId, parentNodeId, removedEdgeCount };
};
