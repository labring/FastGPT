import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import {
  FlowNodeTypeEnum,
  isNestedChildSystemNodeType,
  isNestedParentNodeType
} from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import type { WorkflowDocument } from '../domain/document';
import { WorkflowCommandError } from '../domain/diagnostic';
import { syncContainerChildren } from '../nesting/service';

const getNode = (document: WorkflowDocument, nodeId: string) => {
  const node = document.nodes.find((item) => item.nodeId === nodeId);
  if (!node) {
    throw new WorkflowCommandError([
      { code: 'WORKFLOW_NODE_NOT_FOUND', severity: 'error', nodeId }
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
  if (node.toolConfig?.mcpToolSet) node.toolConfig.mcpToolSet.headerSecret = undefined;
  if (node.toolConfig?.httpToolSet) node.toolConfig.httpToolSet.headerSecret = undefined;
};

/** 克隆节点运行态结构，但不复制密码类输入，避免生成可复用凭据副本。 */
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
      { code: 'WORKFLOW_NODE_ID_DUPLICATED', severity: 'error', nodeId }
    ]);
  }
  if (
    source.flowNodeType === FlowNodeTypeEnum.workflowStart ||
    isNestedParentNodeType(source.flowNodeType) ||
    isNestedChildSystemNodeType(source.flowNodeType)
  ) {
    throw new WorkflowCommandError([
      { code: 'WORKFLOW_UNIQUE_NODE_CLONE_FORBIDDEN', severity: 'error', nodeId: sourceNodeId }
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
  const node = getNode(document, nodeId);
  const parentNodeId = node.parentNodeId;
  if (
    node.flowNodeType === FlowNodeTypeEnum.workflowStart ||
    isNestedChildSystemNodeType(node.flowNodeType)
  ) {
    throw new WorkflowCommandError([
      { code: 'WORKFLOW_NODE_DELETE_FORBIDDEN', severity: 'error', nodeId }
    ]);
  }
  if (node.flowNodeType === FlowNodeTypeEnum.loopRunBreak && parentNodeId) {
    const parent = getNode(document, parentNodeId);
    const mode = parent.inputs.find((item) => item.key === NodeInputKeyEnum.loopRunMode)?.value;
    const breakCount = document.nodes.filter(
      (item) =>
        item.parentNodeId === parentNodeId && item.flowNodeType === FlowNodeTypeEnum.loopRunBreak
    ).length;
    if (mode === 'conditional' && breakCount <= 1) {
      throw new WorkflowCommandError([
        {
          code: 'WORKFLOW_CONDITIONAL_LOOP_BREAK_REQUIRED',
          severity: 'error',
          nodeId: parentNodeId
        }
      ]);
    }
  }

  const deletedNodeIds = new Set([nodeId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of document.nodes) {
      if (
        item.parentNodeId &&
        deletedNodeIds.has(item.parentNodeId) &&
        !deletedNodeIds.has(item.nodeId)
      ) {
        deletedNodeIds.add(item.nodeId);
        changed = true;
      }
    }
  }

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
