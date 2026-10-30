import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import type { Edge, Node } from '@xyflow/react';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  applyWorkflowStartInputAutoFill,
  getWorkflowStartAutoFillValue,
  isWorkflowStartAutoFilledValue
} from '@fastgpt/global/common/workflow/editor/startAutoFill';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import { isEqual } from 'lodash-es';

type WorkflowStartAutoFillPatch = {
  nodeId: string;
  key: string;
  value: FlowNodeInputItemType;
};

const collectWorkflowReachableNodeIds = ({
  startNodeId,
  edges
}: {
  startNodeId: string;
  edges: Array<Pick<Edge, 'source' | 'target'>>;
}) => {
  const reachableNodeIds = new Set<string>();
  const queue = [startNodeId];

  while (queue.length > 0) {
    const sourceNodeId = queue.shift();
    if (!sourceNodeId) continue;

    edges.forEach((edge) => {
      if (edge.source !== sourceNodeId || reachableNodeIds.has(edge.target)) return;
      reachableNodeIds.add(edge.target);
      queue.push(edge.target);
    });
  }

  return reachableNodeIds;
};

/**
 * 收集从流程开始节点可达的下游节点自动填充补丁。
 * 文件上传等系统输入可能在连线之后才开启，因此这里按当前 edge 图整体扫描，
 * 只补空白引用输入，避免覆盖用户已经手动选择的变量。
 */
export const collectWorkflowStartInputAutoFillPatches = ({
  nodes,
  edges,
  workflowStartNode
}: {
  nodes: Node<FlowNodeItemType, string | undefined>[];
  edges: Array<Pick<Edge, 'source' | 'target'>>;
  workflowStartNode: FlowNodeItemType;
}): WorkflowStartAutoFillPatch[] => {
  const nodeMap = new Map(nodes.map((node) => [node.data.nodeId, node.data]));
  const reachableNodeIds = collectWorkflowReachableNodeIds({
    startNodeId: workflowStartNode.nodeId,
    edges
  });

  const patches: WorkflowStartAutoFillPatch[] = [];

  reachableNodeIds.forEach((nodeId) => {
    const targetNode = nodeMap.get(nodeId);
    if (!targetNode) return;

    const nextInputs = applyWorkflowStartInputAutoFill({
      inputs: targetNode.inputs,
      workflowStartNodeId: workflowStartNode.nodeId,
      workflowStartOutputs: workflowStartNode.outputs
    });

    nextInputs.forEach((input) => {
      const prevInput = targetNode.inputs.find((item) => item.key === input.key);
      if (prevInput && !isEqual(prevInput.value, input.value)) {
        patches.push({
          nodeId: targetNode.nodeId,
          key: input.key,
          value: input
        });
      }
    });
  });

  return patches;
};

/**
 * 断开与流程开始的连线后，回滚此前自动写入的引用值。
 * 仅清除与自动填充结果完全一致的 value，保留手动配置或其他上游引用。
 */
/**
 * 删除流程开始节点的某个输出前，回滚由自动填充写入的对应引用。
 * 保留仍然有效的自动填充引用，例如关闭文件上传后 datasetSearchInput 仍保留用户问题引用。
 */
export const collectWorkflowStartOutputAutoFillRevertPatches = ({
  nodes,
  edges,
  workflowStartNode,
  outputKey
}: {
  nodes: Node<FlowNodeItemType, string | undefined>[];
  edges: Array<Pick<Edge, 'source' | 'target'>>;
  workflowStartNode: FlowNodeItemType;
  outputKey: string;
}): WorkflowStartAutoFillPatch[] => {
  if (outputKey !== NodeOutputKeyEnum.userFiles) return [];

  const nodeMap = new Map(nodes.map((node) => [node.data.nodeId, node.data]));
  const reachableNodeIds = collectWorkflowReachableNodeIds({
    startNodeId: workflowStartNode.nodeId,
    edges
  });
  const nextWorkflowStartOutputs = workflowStartNode.outputs.filter(
    (output) => output.key !== outputKey && output.id !== outputKey
  );
  const patches: WorkflowStartAutoFillPatch[] = [];

  reachableNodeIds.forEach((nodeId) => {
    const targetNode = nodeMap.get(nodeId);
    if (!targetNode) return;

    targetNode.inputs.forEach((input) => {
      if (
        !isWorkflowStartAutoFilledValue({
          inputKey: input.key,
          value: input.value,
          workflowStartNodeId: workflowStartNode.nodeId,
          hasUserFilesOutput: true
        })
      ) {
        return;
      }

      const nextValue = getWorkflowStartAutoFillValue({
        inputKey: input.key,
        workflowStartNodeId: workflowStartNode.nodeId,
        hasUserFilesOutput: nextWorkflowStartOutputs.some(
          (output) => output.id === NodeOutputKeyEnum.userFiles
        )
      });

      if (isEqual(input.value, nextValue)) return;

      patches.push({
        nodeId: targetNode.nodeId,
        key: input.key,
        value: {
          ...input,
          value: nextValue
        }
      });
    });
  });

  return patches;
};
