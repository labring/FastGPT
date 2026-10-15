import { cloneDeep, isEqual } from 'lodash-es';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import type { WorkflowVariableStateLike } from '../context/variables';

type NodeOutputState = {
  sourceNodes: RuntimeNodeItemType[];
  targetNodes: RuntimeNodeItemType[];
  childrenNodeIdList?: string[];
};

type SnapshotProps = {
  /** 父变量实例；构造时自动克隆，执行期间通过 snapshot.variableContext 访问副本。 */
  variableContext?: WorkflowVariableStateLike;
  /** 图隔离及交互恢复由执行器负责；这里只跟踪指定运行图的 output 差量。 */
  nodeOutputs?: NodeOutputState;
};

const getOutputSnapshotKey = ({ nodeId, outputId }: { nodeId: string; outputId: string }) =>
  nodeId + ':' + outputId;

/**
 * 管理一次子运行的变量副本、起点快照及父级提交目标。
 *
 * 可独立跟踪变量、节点 output，或同时跟踪两者；调用方只决定何时 commit/discard。
 * 构造后即固定比较基线，不读取执行期间已变化的父值来判断差量。
 * 不隐式激活 Context、不排队提交，也不回滚响应、用量等外部副作用。
 */
export class WorkflowRunStateSnapshot {
  private readonly parentVariableContext?: WorkflowVariableStateLike;
  private readonly childVariableContext?: WorkflowVariableStateLike;
  private readonly variableSnapshot: Map<string, unknown>;
  private readonly nodeOutputs?: NodeOutputState;
  private readonly childrenNodeIds: Set<string>;
  private readonly outputSnapshot = new Map<string, unknown>();
  private settled = false;

  constructor({ variableContext, nodeOutputs }: SnapshotProps) {
    if (!variableContext && !nodeOutputs) {
      throw new Error('Workflow run state snapshot requires variables or node outputs');
    }
    this.parentVariableContext = variableContext;
    this.childVariableContext = variableContext?.clone();
    this.variableSnapshot = new Map(
      Object.entries(this.childVariableContext?.toRuntimeRecord() ?? {}).map(([key, value]) => [
        key,
        cloneDeep(value)
      ])
    );
    this.nodeOutputs = nodeOutputs;
    this.childrenNodeIds = new Set(nodeOutputs?.childrenNodeIdList);

    nodeOutputs?.sourceNodes.forEach((node) => {
      if (this.childrenNodeIds.has(node.nodeId)) return;
      (node.outputs ?? []).forEach((output) => {
        this.outputSnapshot.set(
          getOutputSnapshotKey({ nodeId: node.nodeId, outputId: output.id }),
          cloneDeep(output.value)
        );
      });
    });
  }

  /** 返回构造时创建的变量副本；仅跟踪 output 的实例不提供变量能力。 */
  get variableContext(): WorkflowVariableStateLike {
    if (!this.childVariableContext) {
      throw new Error('Workflow run state snapshot has no variable context');
    }
    return this.childVariableContext;
  }

  /**
   * 立即提交相对起点实际变化的 output 和变量，保留父级无关更新。
   *
   * 保持先 output、后逐个变量 set 的顺序；并非原子事务，中途失败可能已经部分写入。
   * 一次实例只能结算一次，提交失败后也不能重复提交旧差量或通过 discard 回滚。
   */
  async commit(): Promise<void> {
    this.settle();
    this.commitNodeOutputs();

    const parent = this.parentVariableContext;
    const child = this.childVariableContext;
    if (!parent || !child || parent === child) return;

    for (const [key, value] of Object.entries(child.toRuntimeRecord())) {
      if (this.variableSnapshot.has(key) && isEqual(value, this.variableSnapshot.get(key))) {
        continue;
      }
      await parent.set(key, cloneDeep(value));
    }
  }

  /** 丢弃尚未提交的分支；父级状态没有写入，无需执行反向回滚。 */
  discard(): void {
    this.settle();
  }

  /** 在任何异步写入前结算实例，防止重复或并发提交同一份旧快照。 */
  private settle(): void {
    if (this.settled) throw new Error('Workflow run state snapshot is already settled');
    this.settled = true;
  }

  /** 仅更新父图中仍存在且不属于容器子节点的 output，不同步输入、入口或连线状态。 */
  private commitNodeOutputs(): void {
    if (!this.nodeOutputs) return;
    const { sourceNodes, targetNodes } = this.nodeOutputs;
    const sourceNodesMap = new Map(sourceNodes.map((node) => [node.nodeId, node]));

    targetNodes.forEach((targetNode) => {
      if (this.childrenNodeIds.has(targetNode.nodeId)) return;
      const sourceNode = sourceNodesMap.get(targetNode.nodeId);
      if (!sourceNode) return;

      const sourceOutputMap = new Map(
        (sourceNode.outputs ?? []).map((output) => [output.id, output])
      );
      (targetNode.outputs ?? []).forEach((targetOutput) => {
        const sourceOutput = sourceOutputMap.get(targetOutput.id);
        if (!sourceOutput) return;
        const snapshotKey = getOutputSnapshotKey({
          nodeId: targetNode.nodeId,
          outputId: targetOutput.id
        });
        if (isEqual(sourceOutput.value, this.outputSnapshot.get(snapshotKey))) return;

        targetOutput.value = cloneDeep(sourceOutput.value);
      });
    });
  }
}
