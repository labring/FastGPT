import { getErrText } from '@fastgpt/global/common/error/utils';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import { getChildrenResponses } from '@fastgpt/global/core/chat/utils/mergeNode';
import { isToolExecutionResponse } from '@fastgpt/global/core/chat/utils';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { WorkflowRuntimeSummaryType } from '../type';
import type { NodeSummary, NodeSummaryCollector } from '../../types/runtime';

// parent-child 关系只服务于当前进程内的增量去重，不进入 summary 返回值或持久化协议。
const concreteChildParentIds = new WeakMap<WorkflowRuntimeSummaryType, Set<string>>();

/**
 * 创建 runtime nodeResponse 的轻量汇总对象。
 *
 * 该 summary 用于在当前 workflow dispatch 过程中保存运行信号，避免把完整
 * nodeResponses 长时间保留在内存里；child workflow 由自己的 queue 单独维护。
 */
export const createWorkflowRuntimeSummary = (): WorkflowRuntimeSummaryType => {
  const summary: WorkflowRuntimeSummaryType = {
    responseIds: [],
    finishedNodeIds: [],
    hasError: false,
    errorCount: 0,
    hasLoopRunBreak: false,
    hasToolStop: false,
    hasNestedEnd: false,
    citeCollectionIds: [],
    llmInputTokens: 0,
    llmOutputTokens: 0
  };
  concreteChildParentIds.set(summary, new Set());
  return summary;
};

const getConcreteChildParentIds = (summary: WorkflowRuntimeSummaryType) => {
  const existing = concreteChildParentIds.get(summary);
  if (existing) return existing;

  const created = new Set<string>();
  concreteChildParentIds.set(summary, created);
  return created;
};

/** 为单次节点执行创建独立的运行摘要采集器。 */
export const createNodeSummary = (): NodeSummaryCollector => {
  const summary: NodeSummaryCollector = {
    llmInputTokens: 0,
    llmOutputTokens: 0,
    responseIds: [],
    finishedNodeIds: [],
    hasError: false,
    errorCount: 0,
    citeCollectionIds: [],
    hasLoopRunBreak: false,
    hasToolStop: false,
    hasNestedEnd: false,
    totalPoints: 0,
    childResponseCount: 0,
    mergeNodeSummary: (source) => {
      if (!source) return;
      summary.responseIds?.push(...(source.responseIds ?? []));
      summary.finishedNodeIds?.push(...(source.finishedNodeIds ?? []));
      summary.hasError ||= !!source.hasError;
      summary.errorText = source.errorText || summary.errorText;
      summary.errorCount = (summary.errorCount || 0) + (source.errorCount || 0);
      summary.citeCollectionIds?.push(...(source.citeCollectionIds ?? []));
      summary.hasLoopRunBreak ||= !!source.hasLoopRunBreak;
      summary.hasToolStop ||= !!source.hasToolStop;
      summary.hasNestedEnd ||= !!source.hasNestedEnd;
      if (source.nestedEndOutput !== undefined) {
        summary.nestedEndOutput = source.nestedEndOutput;
      }
      if (source.pluginOutput !== undefined) {
        summary.pluginOutput = source.pluginOutput;
      }
      summary.totalPoints = (summary.totalPoints || 0) + (source.totalPoints || 0);
      summary.childResponseCount =
        (summary.childResponseCount || 0) + (source.childResponseCount || 0);
      summary.llmInputTokens += source.llmInputTokens || 0;
      summary.llmOutputTokens += source.llmOutputTokens || 0;
    }
  };

  return summary;
};

/** 返回可安全跨 dispatch 边界传递的节点摘要，避免暴露内部采集回调。 */
export const getNodeSummaryData = (summary: NodeSummary): NodeSummary => ({
  ...(summary.llmInputTokens ? { llmInputTokens: summary.llmInputTokens } : {}),
  ...(summary.llmOutputTokens ? { llmOutputTokens: summary.llmOutputTokens } : {}),
  ...(summary.responseIds?.length ? { responseIds: [...summary.responseIds] } : {}),
  ...(summary.finishedNodeIds?.length ? { finishedNodeIds: [...summary.finishedNodeIds] } : {}),
  ...(summary.hasError ? { hasError: true } : {}),
  ...(summary.errorText ? { errorText: summary.errorText } : {}),
  ...(summary.errorCount ? { errorCount: summary.errorCount } : {}),
  ...(summary.citeCollectionIds?.length
    ? { citeCollectionIds: [...new Set(summary.citeCollectionIds)] }
    : {}),
  ...(summary.hasLoopRunBreak ? { hasLoopRunBreak: true } : {}),
  ...(summary.hasToolStop ? { hasToolStop: true } : {}),
  ...(summary.hasNestedEnd ? { hasNestedEnd: true } : {}),
  ...(summary.nestedEndOutput !== undefined ? { nestedEndOutput: summary.nestedEndOutput } : {}),
  ...(summary.pluginOutput !== undefined ? { pluginOutput: summary.pluginOutput } : {}),
  ...(summary.totalPoints ? { totalPoints: summary.totalPoints } : {}),
  ...(summary.childResponseCount ? { childResponseCount: summary.childResponseCount } : {})
});

/** 将内部 response/runtime summary 转为当前节点的稀疏摘要增量。 */
export const runtimeSummaryToNodeSummary = (
  summary?: WorkflowRuntimeSummaryType
): NodeSummary | undefined => {
  if (!summary) return undefined;

  const nodeSummary = getNodeSummaryData(summary);

  return Object.keys(nodeSummary).length > 0 ? nodeSummary : undefined;
};

/**
 * 移除不能跨工具边界向上提升的错误控制字段。
 *
 * 工具内部错误已经记录在 nodeResponse，不再提升为整轮会话错误；token、积分、引用等
 * 业务汇总字段保留，由调用方通过 mergeNodeSummary 一次性合并。
 */
export const stripNodeSummaryErrorFields = (summary?: NodeSummary): NodeSummary | undefined => {
  if (!summary) return undefined;

  const controlSummary = { ...summary };
  delete controlSummary.hasError;
  delete controlSummary.errorText;
  delete controlSummary.errorCount;

  return Object.keys(controlSummary).length > 0 ? controlSummary : undefined;
};

/**
 * 增量更新当前 workflow 运行控制需要的临时字段。
 *
 * 完整 nodeResponse 会由 writer 及时落库并释放；父节点只需要这些信号来判断
 * nestedEnd 输出、错误、loop break、tool stop、完成节点和当前响应统计。
 * 调用方每处理完一批 nodeResponse，就把当前 summary 和本批响应传进来，返回新的
 * summary，避免重新保存或扫描完整 nodeResponse 列表。
 */
export const summarizeRuntimeNodeResponses = (
  currentSummary: WorkflowRuntimeSummaryType | undefined,
  nodeResponses: ChatHistoryItemResType[] = []
): WorkflowRuntimeSummaryType => {
  const initialSummary = currentSummary
    ? {
        ...currentSummary,
        responseIds: [...currentSummary.responseIds],
        finishedNodeIds: [...currentSummary.finishedNodeIds],
        citeCollectionIds: [...currentSummary.citeCollectionIds]
      }
    : createWorkflowRuntimeSummary();
  const concreteParentIds = getConcreteChildParentIds(initialSummary);
  if (currentSummary) {
    getConcreteChildParentIds(currentSummary).forEach((parentId) =>
      concreteParentIds.add(parentId)
    );
  }

  const responseIdsWithConcreteParent = new Set(
    nodeResponses
      .map((response) => response.parentId)
      .filter((parentId): parentId is string => !!parentId)
  );
  // 已进入 currentSummary 的 response id 不能再次计入统计，避免重复事件或分批更新导致
  // points/responseCount 被累加两次。
  const countedIds = new Set(initialSummary.responseIds);

  type RuntimeNodeResponseWithLLMTokens = ChatHistoryItemResType & {
    inputTokens?: number;
    outputTokens?: number;
    toolCallInputTokens?: number;
    toolCallOutputTokens?: number;
    deepSearchResult?: {
      inputTokens?: number;
      outputTokens?: number;
    };
  };
  // currentSummary 中的 response 已经在之前批次完成 token 归属；后续 parent row
  // 再携带这些 child 时也必须跳过，避免跨 publish 批次重复累计。
  const countedTokenIds = new Set(initialSummary.responseIds);
  const citeCollectionIds = new Set(initialSummary.citeCollectionIds);

  const collectCiteCollectionIds = (response: ChatHistoryItemResType) => {
    if (response.quoteList) {
      response.quoteList.forEach((quote) => {
        if (quote.collectionId) citeCollectionIds.add(quote.collectionId);
      });
    }
    getChildrenResponses(response).forEach(collectCiteCollectionIds);
  };

  /**
   * 读取当前响应自身拥有的 LLM token。
   *
   * childrenResponses/toolDetail/loopDetail 不是通用递归入口：只有知识库节点的
   * 明确 LLM 子响应，以及 dataset deep search 这个没有独立响应行的调用，才在这里补入。
   * wrapper 节点的 child workflow token 由 wrapper 读取 child summary 后显式 push。
   */
  const getResponseLLMTokens = (response: ChatHistoryItemResType) => {
    const current = response as RuntimeNodeResponseWithLLMTokens;
    let inputTokens = current.inputTokens || 0;
    let outputTokens = current.outputTokens || 0;

    if (response.moduleType === FlowNodeTypeEnum.toolCall) {
      inputTokens += current.toolCallInputTokens || 0;
      outputTokens += current.toolCallOutputTokens || 0;
    }

    if (response.moduleType === FlowNodeTypeEnum.datasetSearchNode) {
      inputTokens += current.deepSearchResult?.inputTokens || 0;
      outputTokens += current.deepSearchResult?.outputTokens || 0;

      // dataset search 的这些 child 是同一个 nodeResponse 内部创建的 LLM 调用，
      // 只读取直接子项，embedding/rerank 等非 LLM token 不会进入 runtime summary。
      (response.childrenResponses ?? []).forEach((child) => {
        if (child.moduleType !== FlowNodeTypeEnum.datasetSearchNode) return;
        const childResponse = child as RuntimeNodeResponseWithLLMTokens;
        if (child.id && countedTokenIds.has(child.id)) return;
        inputTokens += childResponse.inputTokens || 0;
        outputTokens += childResponse.outputTokens || 0;
        if (child.id) countedTokenIds.add(child.id);
      });
    }

    return { inputTokens, outputTokens };
  };

  const addResponseToSummary = (
    summary: WorkflowRuntimeSummaryType,
    response: ChatHistoryItemResType,
    collectTokens = true
  ) => {
    // 同一 response id 的后续增量仍可能补充引用，引用集合需要独立于计数去重更新。
    collectCiteCollectionIds(response);
    if (response.id && countedIds.has(response.id)) {
      return summary;
    }
    if (response.id) {
      countedIds.add(response.id);
    }

    if (response.id) {
      summary.responseIds.push(response.id);
    }

    if (collectTokens && (!response.id || !countedTokenIds.has(response.id))) {
      const { inputTokens, outputTokens } = getResponseLLMTokens(response);
      summary.llmInputTokens += inputTokens;
      summary.llmOutputTokens += outputTokens;
      if (response.id) countedTokenIds.add(response.id);
    }

    if (response.nodeId) {
      summary.finishedNodeIds.push(response.nodeId);
    }
    // 工具错误属于模型可继续消费的工具结果，只保留在 nodeResponse 详情中。捕获的错误也不计入运行失败。
    if (
      !response.errorCaptured &&
      !isToolExecutionResponse(response) &&
      (response.error || response.errorText)
    ) {
      summary.hasError = true;
      summary.errorCount += 1;
      summary.errorText = getErrText(response.error || response.errorText);
    }
    if (response.moduleType === FlowNodeTypeEnum.loopRunBreak) {
      summary.hasLoopRunBreak = true;
    }
    if (response.toolStop) {
      summary.hasToolStop = true;
    }
    if (response.moduleType === FlowNodeTypeEnum.nestedEnd) {
      summary.hasNestedEnd = true;
      summary.nestedEndOutput = response.loopOutputValue;
    }
    if (response.moduleType === FlowNodeTypeEnum.pluginOutput && response.pluginOutput) {
      summary.pluginOutput = response.pluginOutput;
    }
    const children = getChildrenResponses(response);
    if (response.parentId) {
      concreteParentIds.add(response.parentId);
    }
    if (response.id && children.length > 0) {
      concreteParentIds.add(response.id);
    }
    if (response.id && responseIdsWithConcreteParent.has(response.id)) {
      concreteParentIds.add(response.id);
    }
    const hasConcreteChild =
      children.length > 0 || (response.id ? concreteParentIds.has(response.id) : false);
    // 已有实际 child response 时，父 response 上的 child 汇总只作为兼容字段，不能再重复累加。
    const totalPoints = response.totalPoints || 0;
    const childResponseCount = hasConcreteChild ? 0 : response.childResponseCount || 0;
    summary.totalPoints = (summary.totalPoints || 0) + totalPoints;
    summary.childResponseCount = (summary.childResponseCount || 0) + 1 + childResponseCount;

    children.forEach((child) => {
      addResponseToSummary(summary, child, false);
    });

    return summary;
  };

  const summary = nodeResponses.reduce<WorkflowRuntimeSummaryType>(
    (summary, response) => addResponseToSummary(summary, response),
    initialSummary
  );
  summary.citeCollectionIds = Array.from(citeCollectionIds);
  concreteChildParentIds.set(summary, concreteParentIds);
  return summary;
};

/** 将一批当前层 response 的摘要增量写入同一个可变 workflow summary。 */
export const updateWorkflowRuntimeSummary = ({
  summary,
  nodeResponses
}: {
  summary: WorkflowRuntimeSummaryType;
  nodeResponses: ChatHistoryItemResType[];
}) => {
  const nextSummary = summarizeRuntimeNodeResponses(summary, nodeResponses);
  Object.assign(summary, nextSummary);
  concreteChildParentIds.set(summary, getConcreteChildParentIds(nextSummary));
};

/**
 * 合并多个子流程或并行分支返回的轻量 nodeResponse summary。
 *
 * 这里不重新扫描完整 nodeResponses，只把各分支已汇总出的控制信号、计费点数和
 * response 计数累加到同一个 summary 中。
 */
export const mergeWorkflowRuntimeSummary = ({
  currentSummary,
  nodeSummary,
  workflowRuntimeSummary
}: {
  currentSummary?: WorkflowRuntimeSummaryType;
  nodeSummary?: NodeSummary;
  workflowRuntimeSummary?: WorkflowRuntimeSummaryType;
}): WorkflowRuntimeSummaryType => {
  const merged = [currentSummary, workflowRuntimeSummary].reduce<WorkflowRuntimeSummaryType>(
    (merged, summary) => {
      if (!summary) return merged;

      merged.responseIds.push(...(summary.responseIds ?? []));
      merged.finishedNodeIds.push(...(summary.finishedNodeIds ?? []));
      merged.hasError ||= summary.hasError;
      if (summary.errorText) {
        merged.errorText = summary.errorText;
      }
      merged.errorCount += summary.errorCount || 0;
      merged.citeCollectionIds.push(...(summary.citeCollectionIds ?? []));
      merged.hasLoopRunBreak ||= summary.hasLoopRunBreak;
      merged.hasToolStop ||= summary.hasToolStop;
      merged.hasNestedEnd ||= summary.hasNestedEnd;
      if (summary.nestedEndOutput !== undefined) {
        merged.nestedEndOutput = summary.nestedEndOutput;
      }
      if (summary.pluginOutput !== undefined) {
        merged.pluginOutput = summary.pluginOutput;
      }
      merged.totalPoints = (merged.totalPoints || 0) + (summary.totalPoints || 0);
      merged.childResponseCount =
        (merged.childResponseCount || 0) + (summary.childResponseCount || 0);
      merged.llmInputTokens += summary.llmInputTokens ?? 0;
      merged.llmOutputTokens += summary.llmOutputTokens ?? 0;

      return merged;
    },
    createWorkflowRuntimeSummary()
  );

  if (nodeSummary) {
    merged.responseIds.push(...(nodeSummary.responseIds ?? []));
    merged.finishedNodeIds.push(...(nodeSummary.finishedNodeIds ?? []));
    merged.hasError ||= !!nodeSummary.hasError;
    if (nodeSummary.errorText) {
      merged.errorText = nodeSummary.errorText;
    }
    merged.errorCount += nodeSummary.errorCount || 0;
    merged.citeCollectionIds.push(...(nodeSummary.citeCollectionIds ?? []));
    merged.hasLoopRunBreak ||= !!nodeSummary.hasLoopRunBreak;
    merged.hasToolStop ||= !!nodeSummary.hasToolStop;
    merged.hasNestedEnd ||= !!nodeSummary.hasNestedEnd;
    if (nodeSummary.nestedEndOutput !== undefined) {
      merged.nestedEndOutput = nodeSummary.nestedEndOutput;
    }
    if (nodeSummary.pluginOutput !== undefined) {
      merged.pluginOutput = nodeSummary.pluginOutput;
    }
    merged.totalPoints = (merged.totalPoints || 0) + (nodeSummary.totalPoints || 0);
    merged.childResponseCount =
      (merged.childResponseCount || 0) + (nodeSummary.childResponseCount || 0);
    merged.llmInputTokens += nodeSummary.llmInputTokens || 0;
    merged.llmOutputTokens += nodeSummary.llmOutputTokens || 0;
  }

  merged.responseIds = [...new Set(merged.responseIds)];
  merged.finishedNodeIds = [...new Set(merged.finishedNodeIds)];
  merged.citeCollectionIds = [...new Set(merged.citeCollectionIds)];

  return merged;
};

/** 从 child dispatch response 中取得当前 workflow 层的统一运行摘要。 */
export const getWorkflowRuntimeSummary = (
  response?: { workflowRuntimeSummary?: WorkflowRuntimeSummaryType } | null
): WorkflowRuntimeSummaryType => response?.workflowRuntimeSummary ?? createWorkflowRuntimeSummary();
