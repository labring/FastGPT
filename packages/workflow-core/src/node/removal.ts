import { WorkflowDiagnosticCodeEnum } from '@fastgpt/global/core/workflow/diagnostic/constants';
import type { WorkflowDocument } from '@fastgpt/global/core/workflow/type/document';
import {
  FlowNodeTypeEnum,
  isNestedChildSystemNodeType
} from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { WorkflowCommandError } from '../domain/diagnostic';
import { getDocumentNode } from '../nesting/service';

/** 计算删除节点及全部后代；保护主入口、工具输入输出及容器系统节点，不修改原文档。 */
export const planNodeRemoval = ({
  document,
  nodeId
}: {
  document: WorkflowDocument;
  nodeId: string;
}) => {
  const node = getDocumentNode(document, nodeId);
  const parentNodeId = node.parentNodeId;
  if (
    [
      FlowNodeTypeEnum.workflowStart,
      FlowNodeTypeEnum.pluginInput,
      FlowNodeTypeEnum.pluginOutput
    ].includes(node.flowNodeType) ||
    isNestedChildSystemNodeType(node.flowNodeType)
  ) {
    throw new WorkflowCommandError([
      { code: WorkflowDiagnosticCodeEnum.nodeDeleteForbidden, severity: 'error', nodeId }
    ]);
  }
  if (node.flowNodeType === FlowNodeTypeEnum.loopRunBreak && parentNodeId) {
    const parent = getDocumentNode(document, parentNodeId);
    const mode = parent.inputs.find((item) => item.key === NodeInputKeyEnum.loopRunMode)?.value;
    const breakCount = document.nodes.filter(
      (item) =>
        item.parentNodeId === parentNodeId && item.flowNodeType === FlowNodeTypeEnum.loopRunBreak
    ).length;
    if (mode === 'conditional' && breakCount <= 1) {
      throw new WorkflowCommandError([
        {
          code: WorkflowDiagnosticCodeEnum.conditionalLoopBreakRequired,
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

  return { deletedNodeIds: [...deletedNodeIds] };
};
