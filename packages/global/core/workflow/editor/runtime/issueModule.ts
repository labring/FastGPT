import { FlowNodeTypeEnum } from '../../node/constant';
import type { WorkflowCheckIssue } from '../../type/node';
import type { WorkflowConfigIssue, WorkflowEnvironment, WorkflowIssueScope } from '../types';
import { addFieldIdentity, valuesEqual } from './kernel';
import { collectConfigIssues, collectNodeIssues, type IssueRuleInput } from './issueRules';
import type { DocumentReadApi, MutationMeta, ReferenceReadApi } from './types';

/**
 * Issue module：拥有 issue 派生结果与可达节点集合。
 * 每笔事务只读一次最终的 Document/Reference/MutationMeta 状态，不写 Document。
 * 判定规则在 issueRules；本 module 只负责状态、scope、缓存与 affected records。
 */

/** 环境事实缺省值：目录未知（跳过模型规则）、sandbox 可用（不产出 sandbox 问题）。 */
const UNKNOWN_ENVIRONMENT: WorkflowEnvironment = {
  sandbox: { configured: true, planSupported: true }
};

/** Create the Workflow Issue module. */
export const createIssueModule = ({
  document,
  reference,
  getEnvironment
}: {
  document: DocumentReadApi;
  reference: ReferenceReadApi;
  /**
   * editor 注入的同步环境事实来源。每轮派生调用一次且不做缓存，
   * 因此实现必须同步且便宜；缺省时本轮不判定任何环境规则。
   */
  getEnvironment?: () => WorkflowEnvironment | undefined;
}) => {
  // region issueState Issue state and reachability tracking

  /** Issue View：唯一读取面，由 rebuildIssues 全量或按候选节点重算。 */
  let issuesByNode = new Map<string, WorkflowCheckIssue[]>();
  /** 工作流级问题桶：chatConfig 的模型问题不属于任何节点。 */
  let configIssues: WorkflowConfigIssue[] = [];
  let reachableNodeIds = new Set<string>();

  const getIssuesByNode = () => issuesByNode;
  const getNodeIssues = (nodeId: string) => issuesByNode.get(nodeId) ?? [];
  const getConfigIssues = () => configIssues;
  const getState = () => ({
    issuesByNode,
    configIssues,
    reachableNodeIds
  });
  const restoreState = (state: ReturnType<typeof getState>) => {
    issuesByNode = state.issuesByNode;
    configIssues = state.configIssues;
    reachableNodeIds = state.reachableNodeIds;
  };
  const readEnvironment = () => getEnvironment?.() ?? UNKNOWN_ENVIRONMENT;

  const calculateReachableNodeIds = () => {
    const graphIndex = document.getGraphIndex();
    const isSourceEdgeValid = document.isSourceEdgeValid;
    const nextReachableNodeIds = new Set<string>();
    const visitReachable = (nodeId: string) => {
      if (nextReachableNodeIds.has(nodeId)) return;
      nextReachableNodeIds.add(nodeId);
      (graphIndex.bySource.get(nodeId) ?? [])
        .filter(isSourceEdgeValid)
        .forEach((edge) => visitReachable(edge.data.target));
    };
    document.getDocument().nodes.forEach((node) => {
      if (
        node.data.flowNodeType === FlowNodeTypeEnum.workflowStart ||
        node.data.flowNodeType === FlowNodeTypeEnum.pluginInput ||
        node.data.flowNodeType === FlowNodeTypeEnum.nestedStart ||
        node.data.flowNodeType === FlowNodeTypeEnum.loopRunStart
      ) {
        visitReachable(node.data.nodeId);
      }
    });
    return nextReachableNodeIds;
  };

  /** 结构变更只刷新受影响的可达性闭包；未触碰节点继续复用旧结果。 */
  const updateReachableNodeIds = (affectedNodeIds: ReadonlySet<string>) => {
    if (affectedNodeIds.size === 0) return;
    const graphIndex = document.getGraphIndex();
    const isSourceEdgeValid = document.isSourceEdgeValid;
    const nextReachableNodeIds = new Set(reachableNodeIds);
    affectedNodeIds.forEach((nodeId) => nextReachableNodeIds.delete(nodeId));
    const queue: string[] = [];
    const queued = new Set<string>();
    const enqueue = (nodeId: string) => {
      if (!affectedNodeIds.has(nodeId) || queued.has(nodeId)) return;
      queued.add(nodeId);
      queue.push(nodeId);
    };

    document.getDocument().nodes.forEach((node) => {
      const nodeId = node.data.nodeId;
      const isStart =
        node.data.flowNodeType === FlowNodeTypeEnum.workflowStart ||
        node.data.flowNodeType === FlowNodeTypeEnum.pluginInput ||
        node.data.flowNodeType === FlowNodeTypeEnum.nestedStart ||
        node.data.flowNodeType === FlowNodeTypeEnum.loopRunStart;
      if (isStart) enqueue(nodeId);
      if (!affectedNodeIds.has(nodeId)) return;
      const hasReachableOutsideSource = (graphIndex.byTarget.get(nodeId) ?? []).some(
        (edge) =>
          !affectedNodeIds.has(edge.data.source) &&
          nextReachableNodeIds.has(edge.data.source) &&
          isSourceEdgeValid(edge)
      );
      if (hasReachableOutsideSource) enqueue(nodeId);
    });

    let queueIndex = 0;
    while (queueIndex < queue.length) {
      const nodeId = queue[queueIndex++];
      nextReachableNodeIds.add(nodeId);
      (graphIndex.bySource.get(nodeId) ?? [])
        .filter(isSourceEdgeValid)
        .forEach((edge) => enqueue(edge.data.target));
    }
    reachableNodeIds = nextReachableNodeIds;
  };

  // endregion

  // region issueRebuild Issue recomputation and transaction refresh

  /**
   * 按当前 Document 与环境事实更新 Issue View；局部事务只重算受影响节点。
   * 判定规则全在 issueRules，本函数只负责 scope、可达集合与结果身份复用。
   */
  const rebuildIssues = (onlyNodeIds?: ReadonlySet<string>) => {
    const current = document.getDocument();
    // 定向重算在旧视图上增量覆盖；全量重算从空表构建，已删除节点自然消失。
    const nextIssues = onlyNodeIds
      ? new Map(issuesByNode)
      : new Map<string, WorkflowCheckIssue[]>();
    if (!onlyNodeIds) reachableNodeIds = calculateReachableNodeIds();
    const ruleInput: IssueRuleInput = {
      document,
      reference,
      reachableNodeIds,
      environment: readEnvironment()
    };

    current.nodes
      .filter((node) => !onlyNodeIds || onlyNodeIds.has(node.data.nodeId))
      .forEach((node) => {
        const issues = collectNodeIssues(ruleInput, node);
        // 内容未变的节点沿用旧数组身份，节点 snapshot 缓存才不会整表失效。
        const previous = issuesByNode.get(node.data.nodeId);
        nextIssues.set(
          node.data.nodeId,
          previous && valuesEqual(previous, issues) ? previous : issues
        );
      });
    onlyNodeIds?.forEach((nodeId) => {
      if (document.getNodeById(nodeId)) return;
      nextIssues.delete(nodeId);
    });
    issuesByNode = nextIssues;
    // 工作流级问题不属于任何节点，每轮按当前 chatConfig 与环境事实整体重算。
    const nextConfigIssues = collectConfigIssues(ruleInput);
    if (!valuesEqual(configIssues, nextConfigIssues)) configIssues = nextConfigIssues;
  };

  /**
   * 按当前环境事实重算 Issue View；History、Savepoint 与 Content Revision 一律不动。
   * 模型目录就绪、sandbox 开关变化等环境事实变更由 host 订阅后调用本入口。
   * 返回视图实际变化的节点，以及工作流级问题是否变化：后者不挂在任何节点上，
   * 但同样会让 workflow snapshot 过期，Runtime Core 需要据此作废缓存。
   */
  const refreshIssues = (
    scope: WorkflowIssueScope
  ): { nodeIds: string[]; configChanged: boolean } => {
    const previous = issuesByNode;
    const previousConfigIssues = configIssues;
    rebuildIssues(scope === 'all' ? undefined : new Set(scope));
    const nodeIds: string[] = [];
    previous.forEach((_issues, nodeId) => {
      if (!issuesByNode.has(nodeId)) nodeIds.push(nodeId);
    });
    issuesByNode.forEach((issues, nodeId) => {
      if (previous.get(nodeId) !== issues) nodeIds.push(nodeId);
    });
    return { nodeIds, configChanged: previousConfigIssues !== configIssues };
  };

  /** Issue View 是同步派生结果；只把实际变更的节点加入 affected records。 */
  const addChangedIssueRecords = (
    meta: MutationMeta,
    previous: Map<string, WorkflowCheckIssue[]>,
    candidateNodeIds: ReadonlySet<string>
  ) => {
    candidateNodeIds.forEach((nodeId) => {
      if (valuesEqual(previous.get(nodeId) ?? [], issuesByNode.get(nodeId) ?? [])) return;
      meta.affectedNodeIds.add(nodeId);
      [...(previous.get(nodeId) ?? []), ...(issuesByNode.get(nodeId) ?? [])].forEach((issue) => {
        if (!issue.inputKey) return;
        addFieldIdentity(meta.affectedFieldIds, {
          nodeId,
          key: issue.inputKey,
          kind: 'input'
        });
      });
    });
  };

  /**
   * 收集本笔事务需要重算 issue 的候选节点。必须在引用/结构派生之前调用：
   * 候选集合顺序 affected 先、changed 后，决定 issues 数组与 affected records 的排列，
   * 派生结束后由 rebuildForTransaction 并入新增的 affected 节点。
   */
  const collectTransactionNodeIds = (meta: MutationMeta): Set<string> => {
    const nodeIds = new Set(meta.affectedNodeIds);
    meta.changedNodeIds.forEach((nodeId) => nodeIds.add(nodeId));
    return nodeIds;
  };

  /**
   * 派生结束后重算 Issue View：并入新增 affected 节点，按结构变化刷新可达集合，
   * 再把实际发生变化的 issue 写回 affected records。
   * 调用前必须已丢弃过期字段状态缓存，否则会用旧引用状态判定 issue。
   */
  const rebuildForTransaction = ({
    meta,
    candidateNodeIds
  }: {
    meta: MutationMeta;
    candidateNodeIds: Set<string>;
  }) => {
    const previousIssues = issuesByNode;
    meta.affectedNodeIds.forEach((nodeId) => candidateNodeIds.add(nodeId));
    if (meta.structureChanged) updateReachableNodeIds(meta.affectedNodeIds);
    rebuildIssues(candidateNodeIds);
    addChangedIssueRecords(meta, previousIssues, candidateNodeIds);
  };

  // endregion

  // region issueLifecycle Issue module cleanup and public assembly

  const clear = () => {
    issuesByNode = new Map();
    configIssues = [];
    reachableNodeIds = new Set();
  };

  return {
    getIssuesByNode,
    getNodeIssues,
    getConfigIssues,
    getState,
    restoreState,
    rebuildIssues,
    refreshIssues,
    addChangedIssueRecords,
    collectTransactionNodeIds,
    rebuildForTransaction,
    clear
  };

  // endregion
};
