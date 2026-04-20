import { cloneDeep } from 'lodash';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { ParallelRunStatusEnum } from '@fastgpt/global/core/workflow/constants';
import { injectNestedStartInputs, safePoints } from '../utils';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { i18nT } from '../../../../../web/i18n/utils';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import type { RuntimeEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import type { AIChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import type { DispatchFlowResponse } from '../type';

// ─── 1. clampParallelConcurrency ─────────────────────────────────────────────

/**
 * Clamp user-specified concurrency to env max.
 * - userInput: floor to integer; <1 → 1; >max → max.
 * - envMax: upper bound from WORKFLOW_PARALLEL_MAX_CONCURRENCY.
 *   Startup validation ensures envMax <= WORKFLOW_MAX_LOOP_TIMES.
 *   If envMax is absent/zero, defaults to 10.
 * - Defaults: user default=5.
 */
export const clampParallelConcurrency = (
  userInput: number | undefined,
  envMax: number | undefined
): number => {
  const max = envMax && envMax > 0 ? Math.floor(envMax) : 10;
  const defaultConcurrency = 5;

  if (userInput === undefined || userInput === null || !Number.isFinite(userInput)) {
    return Math.min(defaultConcurrency, max);
  }
  const floored = Math.floor(userInput);
  if (floored < 1) return 1;
  return Math.min(floored, max);
};

// ─── 2. clampParallelRetryTimes ───────────────────────────────────────────────

/**
 * Clamp user-specified retry times to a valid range [0, 5].
 * - Uses Number.isFinite so that NaN (e.g. Math.floor('abc')) and Infinity are
 *   both caught and replaced with the default.
 * - Defaults to 3 when unset or non-finite.
 */
export const clampParallelRetryTimes = (userInput: number | undefined): number => {
  const DEFAULT = 3;
  const MAX = 5;
  if (userInput === undefined || userInput === null || !Number.isFinite(userInput)) {
    return DEFAULT;
  }
  return Math.min(Math.max(Math.floor(userInput), 0), MAX);
};

// ─── 3. buildTaskRuntimeContext ───────────────────────────────────────────────

type BuildTaskRuntimeContextParams = {
  runtimeNodes: RuntimeNodeItemType[];
  /**
   * Accepts RuntimeEdgeItemType[] (already converted by the caller) rather than
   * StoreEdgeItemType[], so that the call-site does not need a type assertion.
   * These edges are deep-cloned directly — no second storeEdges2RuntimeEdges
   * conversion is applied.
   */
  runtimeEdges: RuntimeEdgeItemType[];
  childrenNodeIdList: string[];
  item: any;
  index: number;
};

type TaskRuntimeContext = {
  taskRuntimeNodes: RuntimeNodeItemType[];
  taskRuntimeEdges: RuntimeEdgeItemType[];
};

/**
 * Per-task lazy clone: deep-clone runtimeNodes & edges,
 * then inject entry node info for the current iteration.
 * Called inside batchRun fn — clone lives exactly one task's lifetime.
 *
 * Edges are expected to already be RuntimeEdgeItemType[] (the caller's
 * props.runtimeEdges). They are cloned directly without a second
 * storeEdges2RuntimeEdges pass.
 */
export const buildTaskRuntimeContext = (
  params: BuildTaskRuntimeContextParams
): TaskRuntimeContext => {
  const { runtimeNodes, runtimeEdges, childrenNodeIdList, item, index } = params;

  const childrenSet = new Set(childrenNodeIdList);
  // Include ALL nodes (not just children) so that external node outputs remain accessible
  // for variable reference resolution (getReferenceVariableValue uses runtimeNodesMap).
  const taskRuntimeNodes = cloneDeep(runtimeNodes);
  const taskRuntimeEdges = cloneDeep(runtimeEdges);

  injectNestedStartInputs({ nodes: taskRuntimeNodes, childrenNodeIdList, item, index });

  return { taskRuntimeNodes, taskRuntimeEdges };
};

// ─── 4. parseTaskResponse & parseTaskError ────────────────────────────────────

export type ParallelTaskResult =
  | { success: true; index: number; data: any; response: DispatchFlowResponse; totalPoints: number }
  | {
      success: false;
      index: number;
      error?: string;
      response?: DispatchFlowResponse;
      totalPoints: number;
    };

/**
 * Parse a successful runWorkflow response into a ParallelTaskResult.
 * Interactive responses are silently treated as failure (per design §3.5).
 *
 * Note: runWorkflow always resolves (never rejects), so node-level errors are
 * detected here by checking whether the nestedEnd node was actually reached.
 * If nestedEnd is absent from flowResponses, the sub-workflow terminated early
 * (e.g. a node threw an error), and the task is considered failed.
 */
export const parseTaskResponse = (params: {
  index: number;
  response: DispatchFlowResponse;
}): ParallelTaskResult => {
  const { index, response } = params;

  // Interactive node: not supported inside parallel runs — mark as failed with a clear reason
  if (response.workflowInteractiveResponse) {
    return {
      success: false,
      index,
      error: i18nT('workflow:parallel_task_interactive_not_supported'),
      response,
      totalPoints: 0
    };
  }

  const loopEndResponse = response.flowResponses.find(
    (r) => r.moduleType === FlowNodeTypeEnum.nestedEnd
  );

  // nestedEnd was not reached → sub-workflow terminated with an error
  if (!loopEndResponse) {
    const errorResponse = response.flowResponses.find((r) => r.error);
    const err = errorResponse?.error;
    return {
      success: false,
      index,
      error: getErrText(err, i18nT('workflow:parallel_task_not_reach_end')),
      response,
      totalPoints: 0
    };
  }

  const totalPoints = response.flowResponses.reduce((acc, r) => acc + safePoints(r.totalPoints), 0);
  return { success: true, index, data: loopEndResponse.loopOutputValue, response, totalPoints };
};

/**
 * Wrap a caught error into a failed ParallelTaskResult.
 */
export const parseTaskError = (index: number, err: unknown): ParallelTaskResult => {
  return { success: false, index, error: getErrText(err), totalPoints: 0 };
};

// ─── 5. aggregateParallelResults ──────────────────────────────────────────────

export type ParallelRunDetail = {
  success: boolean;
  index: number;
  data?: any;
  error?: string;
};

/**
 * Full result item format for the `parallelFullResults` output.
 * Every input position gets one item — null data on failure.
 */
export type ParallelFullResultItem = {
  success: boolean;
  message: string;
  data: any | null;
};

export type AggregatedParallelResults = {
  /** Only successful items' data, in input order */
  filteredArray: any[];
  /** Positional array (same length as input): {success, message, data} objects */
  fullResultsArray: ParallelFullResultItem[];
  /** Full task status array (for nodeResponse display) */
  fullDetail: ParallelRunDetail[];
  /** Overall run status */
  status: ParallelRunStatusEnum;
  totalPoints: number;
  responseDetails: ChatHistoryItemResType[];
  assistantResponses: AIChatItemValueItemType[];
  customFeedbacks: string[];
};

/**
 * Aggregate all parallel task results:
 * - filteredArray: only successful items
 * - fullDetail: all items with success/failure status
 * - totalPoints, responseDetails, assistantResponses, customFeedbacks: merged from successful tasks
 *
 * responseDetails 返回"按任务聚合"的虚拟节点列表：每次任务包装成一个
 * ChatHistoryItemResType，子工作流节点挂在 childrenResponses 下，
 * 方便 UI 按任务维度折叠展示（而非平铺所有子节点）。
 */
export const aggregateParallelResults = (
  taskResults: ParallelTaskResult[],
  opts: {
    /** loopInputArray，按原始 index 对齐；用于生成任务的输入展示 */
    taskInputs: any[];
    /** 并行节点 nodeId，用于生成任务虚拟节点的唯一 id */
    parentNodeId: string;
  }
): AggregatedParallelResults => {
  // Sort by input index so all output arrays are in input order
  const sorted = [...taskResults].sort((a, b) => a.index - b.index);

  const filteredArray: any[] = [];
  const fullResultsArray: ParallelFullResultItem[] = [];
  const fullDetail: ParallelRunDetail[] = [];
  let totalPoints = 0;
  let successCount = 0;
  const responseDetails: ChatHistoryItemResType[] = [];
  const assistantResponses: AIChatItemValueItemType[] = [];
  const customFeedbacks: string[] = [];

  for (const result of sorted) {
    if (result.success) {
      successCount++;
      filteredArray.push(result.data);
      fullResultsArray.push({ success: true, message: '', data: result.data });
      fullDetail.push({ success: true, index: result.index, data: result.data });
    } else {
      fullResultsArray.push({ success: false, message: result.error ?? '', data: null });
      fullDetail.push({ success: false, index: result.index, error: result.error });
    }

    // totalPoints is pre-accumulated across all retry attempts in the caller
    totalPoints += result.totalPoints;

    const childrenResponses: ChatHistoryItemResType[] = result.response?.flowResponses ?? [];
    const runningTime = childrenResponses.reduce(
      (acc, r) => acc + (typeof r.runningTime === 'number' ? r.runningTime : 0),
      0
    );

    const taskNodeId = `${opts.parentNodeId}_task_${result.index}`;
    const taskWrapper: ChatHistoryItemResType = {
      id: taskNodeId,
      nodeId: taskNodeId,
      moduleType: FlowNodeTypeEnum.parallelRun,
      moduleName: i18nT('workflow:parallel_task'),
      moduleNameArgs: { index: result.index + 1 },
      runningTime: Math.round(runningTime * 100) / 100,
      totalPoints: result.totalPoints,
      loopInputValue: opts.taskInputs[result.index],
      loopOutputValue: result.success ? result.data : undefined,
      error: result.success ? undefined : result.error,
      childrenResponses
    };
    responseDetails.push(taskWrapper);

    if (result.response) {
      const response = result.response;
      assistantResponses.push(...(response[DispatchNodeResponseKeyEnum.assistantResponses] || []));

      const feedbacks = response[DispatchNodeResponseKeyEnum.customFeedbacks];
      if (feedbacks && feedbacks.length > 0) {
        customFeedbacks.push(...feedbacks);
      }
    }
  }

  const total = sorted.length;
  const status: ParallelRunStatusEnum =
    successCount === total
      ? ParallelRunStatusEnum.success
      : successCount === 0
        ? ParallelRunStatusEnum.failed
        : ParallelRunStatusEnum.partial_success;

  return {
    filteredArray,
    fullResultsArray,
    fullDetail,
    status,
    totalPoints,
    responseDetails,
    assistantResponses,
    customFeedbacks
  };
};
