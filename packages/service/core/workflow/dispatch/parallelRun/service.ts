import { cloneDeep } from 'lodash';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { ParallelRunStatusEnum } from '@fastgpt/global/core/workflow/constants';
import { injectNestedStartInputs } from '../loop/service';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
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

  if (userInput === undefined || userInput === null || Number.isNaN(userInput)) {
    return Math.min(defaultConcurrency, max);
  }
  const floored = Math.floor(userInput);
  if (floored < 1) return 1;
  return Math.min(floored, max);
};

// ─── 2. buildTaskRuntimeContext ───────────────────────────────────────────────

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

  const taskRuntimeNodes = cloneDeep(runtimeNodes);
  const taskRuntimeEdges = cloneDeep(runtimeEdges);

  injectNestedStartInputs(taskRuntimeNodes, childrenNodeIdList, item, index);

  return { taskRuntimeNodes, taskRuntimeEdges };
};

// ─── 3. cloneTaskVariables ───────────────────────────────────────────────────

/**
 * Deep-clone variables for a parallel task.
 *
 * Rationale (TC0034): variable updates inside the parallel subgraph must NOT
 * leak to the outer workflow. We rely on TWO guarantees to achieve this:
 *
 *   1. Each task receives its own deep-cloned variables object, so any
 *      mutation (top-level or nested) in one task does not affect sibling
 *      tasks or the parent run.
 *   2. The parallelRun dispatcher deliberately does NOT merge
 *      `response.newVariables` back into `props.variables` — any variable
 *      update that happens inside a task is discarded at task boundary.
 */
export const cloneTaskVariables = (variables: Record<string, any>): Record<string, any> => {
  return cloneDeep(variables);
};

// ─── 4. parseTaskResponse & parseTaskError ────────────────────────────────────

export type ParallelTaskResult =
  | { success: true; index: number; data: any; response: DispatchFlowResponse }
  | { success: false; index: number; error?: string; response?: DispatchFlowResponse };

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

  // Interactive node: silently ignore
  if (response.workflowInteractiveResponse) {
    return { success: false, index, response };
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
      error: getErrText(err, 'Sub-workflow did not reach the end node'),
      response
    };
  }

  return { success: true, index, data: loopEndResponse.loopOutputValue, response };
};

/**
 * Wrap a caught error into a failed ParallelTaskResult.
 */
export const parseTaskError = (index: number, err: unknown): ParallelTaskResult => {
  return { success: false, index, error: getErrText(err) };
};

// ─── 5. aggregateParallelResults ─────────────────────────────────────────────

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
 */
export const aggregateParallelResults = (
  taskResults: ParallelTaskResult[]
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

    if (result.response) {
      const response = result.response;
      const points = response.flowUsages.reduce((acc, u) => acc + u.totalPoints, 0);
      totalPoints += points;
      responseDetails.push(...response.flowResponses);
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
