import { cloneDeep } from 'lodash';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { ParallelRunStatusEnum } from '@fastgpt/global/core/workflow/constants';
import {
  collectResponseFeedbacks,
  getRuntimeNodeResponseSummary,
  injectNestedStartInputs
} from '../utils';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
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

  // Include ALL nodes (not just children) so that external node outputs remain accessible
  // for variable reference resolution (getReferenceVariableValue uses runtimeNodesMap).
  const taskRuntimeNodes = cloneDeep(runtimeNodes);
  const taskRuntimeEdges = cloneDeep(runtimeEdges);

  injectNestedStartInputs({ nodes: taskRuntimeNodes, childrenNodeIdList, item, index });

  return { taskRuntimeNodes, taskRuntimeEdges };
};

// ─── 4. parseTaskResponse & parseTaskError ────────────────────────────────────

export type ParallelTaskResult =
  | {
      success: true;
      index: number;
      data: any;
      response: DispatchFlowResponse;
      totalPoints: number;
      taskResponseId?: string;
    }
  | {
      success: false;
      index: number;
      error?: string;
      response?: DispatchFlowResponse;
      totalPoints: number;
      taskResponseId?: string;
    };

/**
 * Parse a successful runWorkflow response into a ParallelTaskResult.
 * Interactive responses are silently treated as failure (per design §3.5).
 *
 * Note: runWorkflow always resolves (never rejects), so node-level errors are
 * detected here by checking whether the nestedEnd node was actually reached.
 * 新 writer 链路不会再返回完整 nodeResponse 列表，因此运行判断只读 runtimeNodeResponseSummary。
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

  const runtimeNodeResponseSummary = getRuntimeNodeResponseSummary(response);
  const hasNestedEnd = runtimeNodeResponseSummary.hasNestedEnd;
  const nestedEndOutput = runtimeNodeResponseSummary.nestedEndOutput;

  // nestedEnd was not reached → sub-workflow terminated with an error
  if (!hasNestedEnd) {
    return {
      success: false,
      index,
      error: getErrText(
        runtimeNodeResponseSummary.errorText,
        i18nT('workflow:parallel_task_not_reach_end')
      ),
      response,
      totalPoints: 0
    };
  }

  // 保持 main 分支旧口径：成功任务的 totalPoints 是子流程各 nodeResponse.totalPoints 之和。
  const totalPoints = runtimeNodeResponseSummary.totalPoints ?? 0;
  return { success: true, index, data: nestedEndOutput, response, totalPoints };
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
  /** 每次 attempt 的展示 wrapper，包含失败重试记录；业务输出仍只使用每个 input 的最终结果。 */
  attemptResponseDetails: ChatHistoryItemResType[];
  assistantResponses: AIChatItemValueItemType[];
  customFeedbacks: string[];
};

const buildParallelTaskWrapper = ({
  result,
  input,
  parentNodeId
}: {
  result: ParallelTaskResult;
  input: any;
  parentNodeId: string;
}): ChatHistoryItemResType => {
  const runtimeSummary = result.response
    ? getRuntimeNodeResponseSummary(result.response)
    : undefined;
  const runningTime = runtimeSummary?.runningTime || 0;
  const taskNodeId = result.taskResponseId || `${parentNodeId}_task_${result.index}`;

  return {
    id: taskNodeId,
    nodeId: taskNodeId,
    moduleType: FlowNodeTypeEnum.parallelRun,
    moduleName: i18nT('workflow:parallel_task'),
    moduleNameArgs: { index: result.index + 1 },
    runningTime: Math.round(runningTime * 100) / 100,
    totalPoints: result.totalPoints,
    loopInputValue: input,
    loopOutputValue: result.success ? result.data : undefined,
    error: result.success ? undefined : result.error,
    childResponseCount: runtimeSummary?.childResponseCount
  };
};

/**
 * Aggregate all parallel task results:
 * - filteredArray: only successful items
 * - fullDetail: all items with success/failure status
 * - totalPoints, responseDetails, assistantResponses, customFeedbacks: merged from successful tasks
 *
 * responseDetails 返回"按任务聚合"的虚拟节点列表：每次任务包装成一个
 * ChatHistoryItemResType，并只保留 childResponseCount 等轻量结构统计。
 * 完整子节点详情由 writer 写入 DB，详情接口再按 parentId 拼回 childrenResponses。
 */
export const aggregateParallelResults = (
  taskResults: ParallelTaskResult[],
  opts: {
    /** loopInputArray，按原始 index 对齐；用于生成任务的输入展示 */
    taskInputs: any[];
    /** 并行节点 nodeId，用于生成任务虚拟节点的唯一 id */
    parentNodeId: string;
    /** 所有 attempt 的运行结果；传入时用于展示失败重试记录，业务输出仍只看 taskResults。 */
    attemptResults?: ParallelTaskResult[];
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
  const attemptResponseDetails = [...(opts.attemptResults || taskResults)]
    .sort((a, b) => {
      if (a.index !== b.index) return a.index - b.index;
      return (a.taskResponseId || '').localeCompare(b.taskResponseId || '');
    })
    .map((result) =>
      buildParallelTaskWrapper({
        result,
        input: opts.taskInputs[result.index],
        parentNodeId: opts.parentNodeId
      })
    );
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

    responseDetails.push(
      buildParallelTaskWrapper({
        result,
        input: opts.taskInputs[result.index],
        parentNodeId: opts.parentNodeId
      })
    );

    if (result.response) {
      const response = result.response;
      assistantResponses.push(...(response[DispatchNodeResponseKeyEnum.assistantResponses] || []));
      collectResponseFeedbacks(response, customFeedbacks);
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
    attemptResponseDetails,
    assistantResponses,
    customFeedbacks
  };
};
