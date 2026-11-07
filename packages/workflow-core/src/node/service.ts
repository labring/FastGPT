import { WorkflowDiagnosticCodeEnum } from '@fastgpt/global/core/workflow/diagnostic/constants';
import { planNodeRemoval } from './removal';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum,
  isNestedChildSystemNodeType,
  isNestedParentNodeType
} from '@fastgpt/global/core/workflow/node/constant';

import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import type { WorkflowDocument } from '@fastgpt/global/core/workflow/type/document';
import { WorkflowCommandError } from '../domain/diagnostic';
import { syncContainerChildren } from '../nesting/service';
import { getNodeAutomationMeta } from '@fastgpt/global/core/workflow/template/automationMeta';

const getNode = (document: WorkflowDocument, nodeId: string) => {
  const node = document.nodes.find((item) => item.nodeId === nodeId);
  if (!node) {
    throw new WorkflowCommandError([
      { code: WorkflowDiagnosticCodeEnum.nodeNotFound, severity: 'error', nodeId }
    ]);
  }
  return node;
};

export const updateNode = ({
  document,
  nodeId,
  name,
  position,
  catchError
}: {
  document: WorkflowDocument;
  nodeId: string;
  name?: string;
  position?: { x: number; y: number };
  catchError?: boolean;
}) => {
  const node = getNode(document, nodeId);
  if (name !== undefined) node.name = name;
  if (position !== undefined) node.position = position;
  if (catchError !== undefined) node.catchError = catchError;
};

const clearSecretInputs = (node: StoreNodeItemType) => {
  for (const input of node.inputs) {
    if (
      input.renderTypeList.includes(FlowNodeInputTypeEnum.password) ||
      input.key === NodeInputKeyEnum.headerSecret
    ) {
      input.value = undefined;
    }
  }
  const mcpToolSet = node.toolConfig?.mcpToolSet;
  if (mcpToolSet && 'headerSecret' in mcpToolSet) mcpToolSet.headerSecret = undefined;

  const httpToolSet = node.toolConfig?.httpToolSet;
  if (httpToolSet && 'headerSecret' in httpToolSet) httpToolSet.headerSecret = undefined;
};

/** 克隆允许新建的节点运行态结构；唯一系统节点及容器不可克隆，且不复制密码类输入。 */
export const cloneNode = ({
  document,
  sourceNodeId,
  nodeId,
  position,
  offset
}: {
  document: WorkflowDocument;
  sourceNodeId: string;
  nodeId: string;
  position?: { x: number; y: number };
  offset?: { x: number; y: number };
}) => {
  const source = getNode(document, sourceNodeId);
  if (document.nodes.some((item) => item.nodeId === nodeId)) {
    throw new WorkflowCommandError([
      { code: WorkflowDiagnosticCodeEnum.nodeIdDuplicated, severity: 'error', nodeId }
    ]);
  }
  if (
    [
      FlowNodeTypeEnum.workflowStart,
      FlowNodeTypeEnum.pluginInput,
      FlowNodeTypeEnum.pluginOutput
    ].includes(source.flowNodeType) ||
    isNestedParentNodeType(source.flowNodeType) ||
    isNestedChildSystemNodeType(source.flowNodeType)
  ) {
    throw new WorkflowCommandError([
      {
        code: WorkflowDiagnosticCodeEnum.uniqueNodeCloneForbidden,
        severity: 'error',
        nodeId: sourceNodeId
      }
    ]);
  }
  if (getNodeAutomationMeta(source.flowNodeType)?.availableForWorkflowBuilder === false) {
    throw new WorkflowCommandError([
      {
        code: WorkflowDiagnosticCodeEnum.templateNotAvailableForBuilder,
        severity: 'error',
        nodeId: sourceNodeId,
        params: { flowNodeType: source.flowNodeType }
      }
    ]);
  }

  const clone = structuredClone(source);
  clone.nodeId = nodeId;
  clone.name = source.name;
  clone.position =
    position ??
    (source.position
      ? {
          x: source.position.x + (offset?.x ?? 40),
          y: source.position.y + (offset?.y ?? 40)
        }
      : offset);
  clearSecretInputs(clone);
  document.nodes.push(clone);
  if (clone.parentNodeId) syncContainerChildren(document, clone.parentNodeId);
};

const isReferenceToDeletedNode = (value: unknown, deletedNodeIds: Set<string>): boolean => {
  if (!Array.isArray(value)) return false;
  if (value.length === 2 && typeof value[0] === 'string' && typeof value[1] === 'string') {
    return deletedNodeIds.has(value[0]);
  }
  return value.some((item) => isReferenceToDeletedNode(item, deletedNodeIds));
};

/** 删除节点、全部后代、相关执行边，并清除指向被删节点的基础输入引用。 */
export const removeNode = ({
  document,
  nodeId
}: {
  document: WorkflowDocument;
  nodeId: string;
}) => {
  const { parentNodeId } = getNode(document, nodeId);
  const deletedNodeIds = new Set(planNodeRemoval({ document, nodeId }).deletedNodeIds);

  const removedEdges = document.executionEdges.filter(
    (edge) => deletedNodeIds.has(edge.source.nodeId) || deletedNodeIds.has(edge.target.nodeId)
  );
  document.nodes = document.nodes.filter((item) => !deletedNodeIds.has(item.nodeId));
  document.executionEdges = document.executionEdges.filter(
    (edge) => !deletedNodeIds.has(edge.source.nodeId) && !deletedNodeIds.has(edge.target.nodeId)
  );

  const clearedReferences: Array<{ nodeId: string; inputKey: string }> = [];
  for (const item of document.nodes) {
    for (const input of item.inputs) {
      if (!isReferenceToDeletedNode(input.value, deletedNodeIds)) continue;
      input.value = undefined;
      clearedReferences.push({ nodeId: item.nodeId, inputKey: input.key });
    }
  }

  if (parentNodeId && document.nodes.some((item) => item.nodeId === parentNodeId)) {
    syncContainerChildren(document, parentNodeId);
  }

  return {
    deletedNodeIds: [...deletedNodeIds],
    removedEdgeCount: removedEdges.length,
    clearedReferences
  };
};
