import { cloneDeep, isEqual } from 'lodash';
import type {
  RuntimeNodeItemType,
  WorkflowVariableStateLike
} from '@fastgpt/global/core/workflow/runtime/type';

export type ExternalOutputSnapshot = Map<string, unknown>;
export type VariableSnapshot = Map<string, unknown>;

const getOutputSnapshotKey = ({ nodeId, outputId }: { nodeId: string; outputId: string }) =>
  `${nodeId}:${outputId}`;

/** 创建容器子运行开始前的外部节点 output 快照，用于后续只同步本轮真实改动。 */
export const createExternalOutputSnapshot = ({
  nodes,
  childrenNodeIdList
}: {
  nodes: RuntimeNodeItemType[];
  childrenNodeIdList: string[];
}): ExternalOutputSnapshot => {
  const childrenSet = new Set(childrenNodeIdList);
  const snapshot: ExternalOutputSnapshot = new Map();

  nodes.forEach((node) => {
    if (childrenSet.has(node.nodeId)) return;

    node.outputs.forEach((output) => {
      snapshot.set(
        getOutputSnapshotKey({ nodeId: node.nodeId, outputId: output.id }),
        cloneDeep(output.value)
      );
    });
  });

  return snapshot;
};

/** 创建容器子运行开始前的变量快照，用于只提交本轮实际修改过的变量。 */
export const createVariableSnapshot = ({
  variableState
}: {
  variableState: WorkflowVariableStateLike;
}): VariableSnapshot => {
  const variables = variableState.toRuntimeRecord();
  return new Map(Object.entries(variables).map(([key, value]) => [key, cloneDeep(value)]));
};

const syncExternalNodeOutputs = ({
  sourceNodes,
  targetNodes,
  childrenNodeIdList,
  initialOutputSnapshot
}: {
  sourceNodes: RuntimeNodeItemType[];
  targetNodes: RuntimeNodeItemType[];
  childrenNodeIdList: string[];
  initialOutputSnapshot: ExternalOutputSnapshot;
}) => {
  const childrenSet = new Set(childrenNodeIdList);
  const sourceNodesMap = new Map(sourceNodes.map((node) => [node.nodeId, node]));

  targetNodes.forEach((targetNode) => {
    if (childrenSet.has(targetNode.nodeId)) return;

    const sourceNode = sourceNodesMap.get(targetNode.nodeId);
    if (!sourceNode) return;

    const sourceOutputMap = new Map(sourceNode.outputs.map((output) => [output.id, output]));
    targetNode.outputs.forEach((targetOutput) => {
      const sourceOutput = sourceOutputMap.get(targetOutput.id);
      if (!sourceOutput) return;

      const snapshotKey = getOutputSnapshotKey({
        nodeId: targetNode.nodeId,
        outputId: targetOutput.id
      });
      if (isEqual(sourceOutput.value, initialOutputSnapshot.get(snapshotKey))) return;

      targetOutput.value = cloneDeep(sourceOutput.value);
    });
  });
};

/**
 * 将容器子运行完成后的副作用回写到父运行态。
 *
 * loopRun / parallelRun 都会用隔离的 runtimeNodes 或 variableState 运行子流程。
 * 这里统一处理两类需要显式提交的副作用：
 * - 变量更新节点写到容器外节点 output 的值，只同步相对本轮开始发生变化的 output。
 * - 子运行 clone 出来的全局变量状态，只把相对本轮开始发生变化的变量提交回父状态。
 *
 * 多个并行任务写同一变量或 output 时，调用方按任务完成顺序调用本函数，后完成者覆盖先完成者。
 */
export const syncContainerRunState = async ({
  sourceNodes,
  targetNodes,
  childrenNodeIdList,
  initialOutputSnapshot,
  initialVariableSnapshot,
  childVariableState,
  parentVariableState
}: {
  sourceNodes: RuntimeNodeItemType[];
  targetNodes: RuntimeNodeItemType[];
  childrenNodeIdList: string[];
  initialOutputSnapshot: ExternalOutputSnapshot;
  initialVariableSnapshot?: VariableSnapshot;
  childVariableState?: WorkflowVariableStateLike;
  parentVariableState?: WorkflowVariableStateLike;
}) => {
  syncExternalNodeOutputs({
    sourceNodes,
    targetNodes,
    childrenNodeIdList,
    initialOutputSnapshot
  });

  if (!childVariableState || !parentVariableState || childVariableState === parentVariableState) {
    return;
  }

  const childVariables = childVariableState.toRuntimeRecord();
  for (const [key, value] of Object.entries(childVariables)) {
    if (
      initialVariableSnapshot &&
      initialVariableSnapshot.has(key) &&
      isEqual(value, initialVariableSnapshot.get(key))
    ) {
      continue;
    }

    await parentVariableState.set(key, cloneDeep(value));
  }
};
