import { cloneDeep } from 'lodash';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type {
  DispatchNodeResultType,
  ModuleDispatchProps
} from '@fastgpt/global/core/workflow/runtime/type';
import type { AIChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import type { WorkflowInteractiveResponseType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import {
  rewriteNodeOutputByHistories,
  storeEdges2RuntimeEdges
} from '@fastgpt/global/core/workflow/runtime/utils';
import { LoopRunModeEnum } from '@fastgpt/global/core/workflow/template/system/loopRun/loopRun';
import type { WorkflowNodeResponseWriter } from '../../../chat/nodeResponseStorage';

import { serviceEnv } from '../../../../env';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import { runWorkflow } from '..';
import {
  collectResponseFeedbacks,
  getRuntimeNodeResponseSummary,
  getNodeErrResponse,
  mergeRuntimeNodeResponseSummary,
  pushSubWorkflowUsage
} from '../utils';
import {
  hasLoopRunBreakChild,
  injectLoopRunStart,
  type LoopRunHistoryItem,
  pickCustomOutputInputs,
  readCustomOutputSnapshot
} from './service';

type Props = ModuleDispatchProps<{
  [NodeInputKeyEnum.loopRunMode]: LoopRunModeEnum;
  [NodeInputKeyEnum.loopRunInputArray]?: Array<any>;
  [NodeInputKeyEnum.childrenNodeIdList]: string[];
}> & {
  nodeResponseWriter?: WorkflowNodeResponseWriter;
  nodeResponseParentId?: string;
};

type Response = DispatchNodeResultType<Record<string, any>>;

export const dispatchLoopRun = async (props: Props): Promise<Response> => {
  const { params, runtimeNodes, runtimeEdges, node, lastInteractive, checkIsStopping } = props;
  const { name } = node;
  const mode = params[NodeInputKeyEnum.loopRunMode] ?? LoopRunModeEnum.array;
  const childrenNodeIdList = params[NodeInputKeyEnum.childrenNodeIdList] ?? [];
  const inputArray = params[NodeInputKeyEnum.loopRunInputArray] ?? [];

  const maxLength = serviceEnv.WORKFLOW_MAX_LOOP_TIMES;
  const maxIterationsMessage = i18nT('workflow:loop_run_max_iterations_exceeded');

  // Surface precheck failures through `errorText` to match the max-iterations
  // protocol, so `catchError` and downstream error-handle routing see them.
  const preCheckError = (() => {
    if (mode === LoopRunModeEnum.array && !Array.isArray(inputArray)) {
      return i18nT('workflow:loop_run_input_not_array');
    }
    if (mode === LoopRunModeEnum.array && inputArray.length > maxLength) {
      return maxIterationsMessage;
    }
    // Without a break node, conditional mode can only stop at WORKFLOW_MAX_LOOP_TIMES.
    if (
      mode === LoopRunModeEnum.conditional &&
      !hasLoopRunBreakChild(runtimeNodes, childrenNodeIdList)
    ) {
      return i18nT('workflow:loop_run_conditional_requires_break');
    }
    return undefined;
  })();

  if (preCheckError) {
    return getNodeErrResponse({
      error: preCheckError,
      responseData: {
        ...(mode === LoopRunModeEnum.array ? { loopRunInput: inputArray } : {})
      }
    });
  }

  // Isolate from parent so concurrent siblings don't mutate our view.
  let isolatedNodes = cloneDeep(runtimeNodes);
  const isolatedEdges = cloneDeep(runtimeEdges);

  const customOutputInputs = pickCustomOutputInputs(node.inputs, node.outputs);

  let interactiveData =
    lastInteractive?.type === 'loopRunInteractive' ? lastInteractive.params : undefined;

  // On resume, the inner loop-body outputs (e.g. loopRunStart.currentIteration) were
  // captured into childrenResponse.nodeOutputs by the inner handleInteractiveResult.
  // The top-level restore in chat/completions only reads the outer nodeOutputs, which
  // doesn't cover the loop body — apply the inner snapshot here so downstream refs
  // in the resumed iteration resolve correctly.
  if (interactiveData?.childrenResponse) {
    isolatedNodes = rewriteNodeOutputByHistories(isolatedNodes, interactiveData.childrenResponse);
  }

  const loopHistory: LoopRunHistoryItem[] = interactiveData
    ? ((interactiveData.loopHistory as LoopRunHistoryItem[]) ?? [])
    : [];
  const assistantResponses: AIChatItemValueItemType[] = [];
  const customFeedbacks: string[] = [];
  let totalPoints = 0;
  let childResponseCount = 0;
  let interactiveResponse: WorkflowInteractiveResponseType | undefined;
  // Pre-interrupt runtime summary survives across resume here, so loopRun can still
  // calculate finished nodes, child stats and wall time without retaining full child details.
  let pendingIterationSummary = interactiveData?.pendingIterationSummary;
  const getWrapperSummary = ({
    isResumeIteration,
    response
  }: {
    isResumeIteration: boolean;
    response: Response;
  }) => {
    const currentSummary = getRuntimeNodeResponseSummary(response);
    const fullSummary = isResumeIteration
      ? mergeRuntimeNodeResponseSummary(pendingIterationSummary, currentSummary)
      : currentSummary;

    // 同一个 iterationResponseId 会在暂停和恢复后各写一条 wrapper row；读取时数值字段按
    // id/parentId 累加，所以恢复后的 wrapper 必须只写本次 resume 产生的增量统计。
    return {
      fullSummary,
      wrapperSummary: isResumeIteration ? currentSummary : fullSummary
    };
  };

  const resumeIteration = interactiveData?.iteration;
  let iteration = resumeIteration ?? 1;
  // Hit the iteration budget (primarily a conditional-mode guard). Signal via
  // `error` on return so the accumulated loopHistory/loopDetail survives for
  // user debugging, instead of reject'ing and dropping everything.
  let maxIterationsExceeded = false;

  while (true) {
    if (checkIsStopping()) {
      break;
    }
    // Check exhaustion before maxLength so `inputArray.length === maxLength` runs cleanly.
    const arrayItem = (() => {
      if (mode !== LoopRunModeEnum.array) {
        return { exhausted: false as const, index: undefined, item: undefined };
      }
      const index = iteration - 1;
      if (index >= inputArray.length) return { exhausted: true as const };
      return { exhausted: false as const, index, item: inputArray[index] };
    })();
    if (arrayItem.exhausted) break;
    const currentIndex = arrayItem.index;
    const currentItem = arrayItem.item;

    if (iteration > maxLength) {
      maxIterationsExceeded = true;
      break;
    }

    const isResumeIteration = !!interactiveData && iteration === resumeIteration;
    const loopRunNodeResponseId = props.nodeResponseParentId || node.nodeId;
    const iterationResponseId = `${loopRunNodeResponseId}:iter:${iteration}`;

    if (isResumeIteration) {
      isolatedNodes.forEach((n) => {
        if (interactiveData?.childrenResponse?.entryNodeIds.includes(n.nodeId)) {
          n.isEntry = true;
        }
      });
    } else {
      injectLoopRunStart({
        nodes: isolatedNodes,
        childrenNodeIdList,
        mode,
        item: currentItem,
        index: currentIndex,
        iteration
      });
    }

    const response = await runWorkflow({
      ...props,
      lastInteractive: interactiveData?.childrenResponse,
      nodeResponseParentId: iterationResponseId,
      runtimeNodes: isolatedNodes,
      runtimeEdges: cloneDeep(
        storeEdges2RuntimeEdges(isolatedEdges, interactiveData?.childrenResponse)
      )
    });

    // Merge pre-interrupt runtime summary so resumed iteration still sees the full
    // set of finished nodes and stats without keeping full child nodeResponse data.
    const { fullSummary: iterationSummary, wrapperSummary } = getWrapperSummary({
      isResumeIteration,
      response
    });
    const iterationChildResponseCount = wrapperSummary.childResponseCount;
    const iterationRunningTime = wrapperSummary.runningTime;
    assistantResponses.push(...response.assistantResponses);
    const iterationTotalPoints = pushSubWorkflowUsage({
      usagePush: props.usagePush,
      response,
      name,
      iteration
    });
    const iterationDetailTotalPoints = wrapperSummary.totalPoints ?? iterationTotalPoints;
    totalPoints += iterationTotalPoints;
    collectResponseFeedbacks(response, customFeedbacks);

    // Apply `finishedNodeIds` over the merged children so pre-interrupt nodes count
    // as finished for the customOutputs snapshot.
    const finishedNodeIds = new Set(iterationSummary.finishedNodeIds);
    const customOutputs = readCustomOutputSnapshot({
      customOutputInputs,
      runtimeNodes: isolatedNodes,
      variableState: props.variableState,
      finishedNodeIds,
      childrenNodeIdList
    });

    // Wrap this iteration as a virtual task node so the whole-response tree
    // shows a per-iteration layer through writer/event. Parent loopRun only keeps
    // summary stats and business history.
    const pushIterationDetail = async (opts: { error?: string }) => {
      const wrapper = {
        id: iterationResponseId,
        nodeId: iterationResponseId,
        moduleType: FlowNodeTypeEnum.loopRun,
        moduleName: i18nT('workflow:parallel_task'),
        moduleNameArgs: { index: iteration },
        runningTime: Math.round(iterationRunningTime * 100) / 100,
        totalPoints: iterationDetailTotalPoints,
        loopInputValue: mode === LoopRunModeEnum.array ? currentItem : undefined,
        loopOutputValue: customOutputs,
        error: opts.error,
        childResponseCount: iterationChildResponseCount
      };
      childResponseCount += 1 + (wrapper.childResponseCount || 0);
      if (props.nodeResponseWriter) {
        await props.nodeResponseWriter.recordWithParent([wrapper], props.nodeResponseParentId);
      }
    };

    // Pause: stash accumulated children so the next resume still sees pre-interrupt
    // nodes (supports multiple interrupts in the same iteration). 暂停时也写一次 wrapper，
    // 作为本轮 child nodeResponses 的 parent；恢复完成后会用同一个 iterationResponseId
    // 再写增量 wrapper，读取时按 id/parentId 累加统计并合并 children。
    if (response.workflowInteractiveResponse) {
      interactiveResponse = response.workflowInteractiveResponse;
      pendingIterationSummary = iterationSummary;
      await pushIterationDetail({});
      break;
    }

    if (iterationSummary.hasError) {
      const errText = getErrText(iterationSummary.errorText);
      await pushIterationDetail({ error: errText });
      loopHistory.push({
        iteration,
        customOutputs,
        success: false,
        error: errText
      });
      break;
    }

    await pushIterationDetail({});
    loopHistory.push({ iteration, customOutputs, success: true });

    if (iterationSummary.hasLoopRunBreak) break;

    // Resume state is one-shot; clear so subsequent iterations enter clean.
    // injectLoopRunStart only re-sets loopRunStart, so explicitly drop stale
    // isEntry flags the resume branch set on other children (e.g. formInput).
    if (isResumeIteration) {
      isolatedNodes.forEach((n) => {
        if (n.flowNodeType !== FlowNodeTypeEnum.loopRunStart) {
          n.isEntry = false;
        }
      });
    }
    interactiveData = undefined;
    pendingIterationSummary = undefined;

    iteration++;
  }

  const lastEntry = loopHistory[loopHistory.length - 1];
  const lastSnapshot: Record<string, any> = lastEntry?.customOutputs ?? {};
  const lastFailed = !!lastEntry && lastEntry.success === false;

  const data: Record<string, any> = {
    ...lastSnapshot
  };

  const errorText = maxIterationsExceeded
    ? maxIterationsMessage
    : lastFailed
      ? (lastEntry?.error ?? i18nT('workflow:loop_run_iteration_failed'))
      : undefined;
  return {
    data,
    [DispatchNodeResponseKeyEnum.assistantResponses]: assistantResponses,
    [DispatchNodeResponseKeyEnum.interactive]: interactiveResponse
      ? {
          type: 'loopRunInteractive',
          params: {
            loopHistory,
            childrenResponse: interactiveResponse,
            iteration,
            pendingIterationSummary
          }
        }
      : undefined,
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      totalPoints,
      loopRunInput: mode === LoopRunModeEnum.array ? inputArray : undefined,
      loopRunIterations: loopHistory.length,
      loopRunHistory: loopHistory,
      childResponseCount,
      ...(errorText ? { errorText } : {})
    },
    [DispatchNodeResponseKeyEnum.customFeedbacks]:
      customFeedbacks.length > 0 ? customFeedbacks : undefined,
    ...(errorText
      ? {
          error: { [NodeOutputKeyEnum.errorText]: errorText }
        }
      : {})
  };
};
