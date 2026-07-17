import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import type { Edge, Node } from 'reactflow';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { nodeInputIsReference } from '@fastgpt/global/core/workflow/utils';
import type {
  FlowNodeInputItemType,
  FlowNodeOutputItemType,
  ReferenceItemValueType,
  ReferenceValueType
} from '@fastgpt/global/core/workflow/type/io';
import { isEqual } from 'lodash-es';

/** 引用输入是否尚未选择（空占位 / 未选变量），区别于曾经选中但已失效的引用。 */
const isUnsetReferenceValue = (value: unknown) => {
  if (value === undefined || value === null || value === '') return true;
  if (!Array.isArray(value)) return true;
  if (value.length === 0) return true;

  // 单引用 [nodeId, outputId]；占位符 ['', ''] 或格式不完整均视为未选择
  if (value.length === 2 && !Array.isArray(value[0])) {
    const [refNodeId, refOutputId] = value;
    if (typeof refNodeId !== 'string') return true;
    return !refNodeId || !refOutputId;
  }

  return false;
};

/** 根据流程开始节点输出，计算目标 input 的默认引用值；无匹配规则时返回 undefined。 */
const getWorkflowStartAutoFillValue = ({
  inputKey,
  workflowStartNodeId,
  hasUserFilesOutput
}: {
  inputKey: string;
  workflowStartNodeId: string;
  hasUserFilesOutput: boolean;
}): ReferenceValueType | undefined => {
  if (inputKey === NodeInputKeyEnum.userChatInput) {
    return [workflowStartNodeId, NodeOutputKeyEnum.userChatInput];
  }

  if (inputKey === NodeInputKeyEnum.datasetSearchInput) {
    const refs: ReferenceItemValueType[] = [[workflowStartNodeId, NodeOutputKeyEnum.userChatInput]];
    if (hasUserFilesOutput) {
      refs.push([workflowStartNodeId, NodeOutputKeyEnum.userFiles]);
    }
    return refs;
  }

  if (inputKey === NodeInputKeyEnum.fileUrlList) {
    if (!hasUserFilesOutput) return undefined;
    return [[workflowStartNodeId, NodeOutputKeyEnum.userFiles]];
  }

  return undefined;
};

/**
 * 为空白引用输入自动填充「流程开始」上游输出引用。
 * 仅处理引用类输入且 value 尚未配置的场景，不覆盖已有合法手动引用。
 */
export const applyWorkflowStartInputAutoFill = ({
  inputs,
  workflowStartNodeId,
  workflowStartOutputs
}: {
  inputs: FlowNodeInputItemType[];
  workflowStartNodeId: string;
  workflowStartOutputs: FlowNodeOutputItemType[];
}): FlowNodeInputItemType[] => {
  const hasUserFilesOutput = workflowStartOutputs.some(
    (output) => output.id === NodeOutputKeyEnum.userFiles
  );

  return inputs.map((input) => {
    if (!nodeInputIsReference(input) || !isUnsetReferenceValue(input.value)) {
      return input;
    }

    const autoFillValue = getWorkflowStartAutoFillValue({
      inputKey: input.key,
      workflowStartNodeId,
      hasUserFilesOutput
    });

    if (autoFillValue === undefined) {
      return input;
    }

    return {
      ...input,
      value: autoFillValue
    };
  });
};

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

/** 判断 input.value 是否为流程开始自动填充产生的引用，用于断线回滚时避免误清手动配置。 */
const isWorkflowStartAutoFilledValue = ({
  inputKey,
  value,
  workflowStartNodeId,
  hasUserFilesOutput
}: {
  inputKey: string;
  value: unknown;
  workflowStartNodeId: string;
  hasUserFilesOutput: boolean;
}) => {
  const autoFillValue = getWorkflowStartAutoFillValue({
    inputKey,
    workflowStartNodeId,
    hasUserFilesOutput
  });
  if (autoFillValue === undefined) return false;
  return isEqual(value, autoFillValue);
};

/**
 * 断开与流程开始的连线后，回滚此前自动写入的引用值。
 * 仅清除与自动填充结果完全一致的 value，保留手动配置或其他上游引用。
 */
export const revertWorkflowStartInputAutoFill = ({
  inputs,
  workflowStartNodeId,
  workflowStartOutputs
}: {
  inputs: FlowNodeInputItemType[];
  workflowStartNodeId: string;
  workflowStartOutputs: FlowNodeOutputItemType[];
}): FlowNodeInputItemType[] => {
  const hasUserFilesOutput = workflowStartOutputs.some(
    (output) => output.id === NodeOutputKeyEnum.userFiles
  );

  return inputs.map((input) => {
    if (
      !isWorkflowStartAutoFilledValue({
        inputKey: input.key,
        value: input.value,
        workflowStartNodeId,
        hasUserFilesOutput
      })
    ) {
      return input;
    }

    return {
      ...input,
      value: undefined
    };
  });
};

/**
 * 根据被删除的连线，收集需要回滚的流程开始自动填充补丁。
 * 任意位置断线都可能让部分下游节点失去流程开始可达性，因此这里比较删除前后
 * 每个流程开始节点的可达集合，只清理「删除前可达、删除后不可达」节点上的自动填充值。
 */
export const collectWorkflowStartAutoFillRevertPatches = ({
  removedEdges,
  remainingEdges,
  getNodeById
}: {
  removedEdges: Array<Pick<Edge, 'id' | 'source' | 'target'>>;
  remainingEdges: Array<Pick<Edge, 'id' | 'source' | 'target'>>;
  getNodeById: (nodeId: string) => FlowNodeItemType | undefined;
}): Array<{ nodeId: string; key: string; value: FlowNodeInputItemType }> => {
  const patches: Array<{ nodeId: string; key: string; value: FlowNodeInputItemType }> = [];
  const processedNodes = new Set<string>();
  const previousEdges = remainingEdges.concat(removedEdges);
  const workflowStartNodes = Array.from(
    new Map(
      previousEdges
        .map((edge) => getNodeById(edge.source))
        .filter((node): node is FlowNodeItemType => {
          return node?.flowNodeType === FlowNodeTypeEnum.workflowStart;
        })
        .map((node) => [node.nodeId, node])
    ).values()
  );

  workflowStartNodes.forEach((sourceNode) => {
    const previousReachableNodeIds = collectWorkflowReachableNodeIds({
      startNodeId: sourceNode.nodeId,
      edges: previousEdges
    });
    const nextReachableNodeIds = collectWorkflowReachableNodeIds({
      startNodeId: sourceNode.nodeId,
      edges: remainingEdges
    });

    previousReachableNodeIds.forEach((nodeId) => {
      if (nextReachableNodeIds.has(nodeId) || processedNodes.has(nodeId)) return;

      const targetNode = getNodeById(nodeId);
      if (!targetNode) return;

      processedNodes.add(nodeId);
      const nextInputs = revertWorkflowStartInputAutoFill({
        inputs: targetNode.inputs,
        workflowStartNodeId: sourceNode.nodeId,
        workflowStartOutputs: sourceNode.outputs
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
  });

  return patches;
};

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

/**
 * 恢复导入/持久化工作流时，清理旧版本自动填充留下的文件引用。
 *
 * 仅处理流程开始节点当前没有 userFiles 输出，但下游仍保留「自动填充形态」
 * userFiles 引用的情况；普通手动引用、已删除节点引用仍交给工作流校验报错。
 */
export const normalizeWorkflowStartAutoFillReferencesOnLoad = ({
  nodes,
  edges,
  workflowStartNode
}: {
  nodes: Node<FlowNodeItemType, string | undefined>[];
  edges: Array<Pick<Edge, 'source' | 'target'>>;
  workflowStartNode: FlowNodeItemType | undefined;
}): Node<FlowNodeItemType, string | undefined>[] => {
  if (!workflowStartNode) return nodes;

  const hasUserFilesOutput = workflowStartNode.outputs.some(
    (output) => output.id === NodeOutputKeyEnum.userFiles
  );
  if (hasUserFilesOutput) return nodes;

  const patches = collectWorkflowStartOutputAutoFillRevertPatches({
    nodes,
    edges,
    workflowStartNode,
    outputKey: NodeOutputKeyEnum.userFiles
  });
  if (patches.length === 0) return nodes;

  return nodes.map((node) => {
    const nodePatches = patches.filter((patch) => patch.nodeId === node.data.nodeId);
    if (nodePatches.length === 0) return node;

    return {
      ...node,
      data: {
        ...node.data,
        inputs: node.data.inputs.map((input) => {
          const patch = nodePatches.find((item) => item.key === input.key);
          return patch ? patch.value : input;
        })
      }
    };
  });
};
