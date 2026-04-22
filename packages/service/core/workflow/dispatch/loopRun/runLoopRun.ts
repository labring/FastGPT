import { cloneDeep } from 'lodash';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type {
  DispatchNodeResultType,
  ModuleDispatchProps
} from '@fastgpt/global/core/workflow/runtime/type';
import type {
  AIChatItemValueItemType,
  ChatHistoryItemResType
} from '@fastgpt/global/core/chat/type';
import type { WorkflowInteractiveResponseType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { storeEdges2RuntimeEdges } from '@fastgpt/global/core/workflow/runtime/utils';
import { LoopRunModeEnum } from '@fastgpt/global/core/workflow/template/system/loopRun/loopRun';

import { env } from '../../../../env';
import { runWorkflow } from '..';
import {
  collectResponseFeedbacks,
  extractFinishedNodeIds,
  hasLoopRunBreakChild,
  injectLoopRunStart,
  isLoopBreakHit,
  type LoopRunHistoryItem,
  pickCustomOutputInputs,
  pushSubWorkflowUsage,
  readCustomOutputSnapshot
} from './service';

type Props = ModuleDispatchProps<{
  [NodeInputKeyEnum.loopRunMode]: LoopRunModeEnum;
  [NodeInputKeyEnum.loopRunInputArray]?: Array<any>;
  [NodeInputKeyEnum.childrenNodeIdList]: string[];
}>;

type Response = DispatchNodeResultType<Record<string, any>>;

export const dispatchLoopRun = async (props: Props): Promise<Response> => {
  const { params, runtimeNodes, runtimeEdges, node, lastInteractive } = props;
  const { name } = node;
  const mode = params[NodeInputKeyEnum.loopRunMode] ?? LoopRunModeEnum.array;
  const childrenNodeIdList = params[NodeInputKeyEnum.childrenNodeIdList] ?? [];
  const inputArray = params[NodeInputKeyEnum.loopRunInputArray] ?? [];

  const maxLength = env.WORKFLOW_MAX_LOOP_TIMES;

  // Surface precheck failures through `errorText` to match the max-iterations
  // protocol, so `catchError` and downstream error-handle routing see them.
  const preCheckError = (() => {
    if (mode === LoopRunModeEnum.array && !Array.isArray(inputArray)) {
      return 'Input value is not an array';
    }
    if (mode === LoopRunModeEnum.array && inputArray.length > maxLength) {
      return `Input array length cannot be greater than ${maxLength}`;
    }
    // Without a break node, conditional mode can only stop at WORKFLOW_MAX_LOOP_TIMES.
    if (
      mode === LoopRunModeEnum.conditional &&
      !hasLoopRunBreakChild(runtimeNodes, childrenNodeIdList)
    ) {
      return 'Conditional loopRun requires at least one loopRunBreak node';
    }
    return undefined;
  })();

  if (preCheckError) {
    return {
      data: {},
      [DispatchNodeResponseKeyEnum.nodeResponse]: {
        totalPoints: 0,
        loopRunInput: mode === LoopRunModeEnum.array ? inputArray : undefined,
        loopRunIterations: 0,
        loopRunHistory: [],
        loopRunDetail: [],
        mergeSignId: node.nodeId
      },
      error: { [NodeOutputKeyEnum.errorText]: preCheckError }
    };
  }

  // Isolate from parent so concurrent siblings don't mutate our view.
  const isolatedNodes = cloneDeep(runtimeNodes);
  const isolatedEdges = cloneDeep(runtimeEdges);

  const customOutputInputs = pickCustomOutputInputs(node.inputs);

  let interactiveData =
    lastInteractive?.type === 'loopRunInteractive' ? lastInteractive.params : undefined;

  const loopHistory: LoopRunHistoryItem[] = interactiveData
    ? (interactiveData.loopHistory as LoopRunHistoryItem[]) ?? []
    : [];
  const loopResponseDetail: ChatHistoryItemResType[] = [];
  const assistantResponses: AIChatItemValueItemType[] = [];
  const customFeedbacks: string[] = [];
  let totalPoints = 0;
  let newVariables: Record<string, any> = props.variables;
  let interactiveResponse: WorkflowInteractiveResponseType | undefined;

  const resumeIteration = interactiveData?.iteration;
  let iteration = resumeIteration ?? 1;
  // Hit the iteration budget (primarily a conditional-mode guard). Signal via
  // `error` on return so the accumulated loopHistory/loopDetail survives for
  // user debugging, instead of reject'ing and dropping everything.
  let maxIterationsExceeded = false;

  while (true) {
    if (iteration > maxLength) {
      maxIterationsExceeded = true;
      break;
    }

    let currentIndex: number | undefined;
    let currentItem: any;
    if (mode === LoopRunModeEnum.array) {
      currentIndex = iteration - 1;
      if (currentIndex >= inputArray.length) break;
      currentItem = inputArray[currentIndex];
    }

    const isResumeIteration = !!interactiveData && iteration === resumeIteration;

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
      variables: newVariables,
      runtimeNodes: isolatedNodes,
      runtimeEdges: cloneDeep(
        storeEdges2RuntimeEdges(isolatedEdges, interactiveData?.childrenResponse)
      )
    });

    loopResponseDetail.push(...response.flowResponses);
    assistantResponses.push(...response.assistantResponses);
    totalPoints += pushSubWorkflowUsage({
      usagePush: props.usagePush,
      response,
      name,
      iteration
    });
    collectResponseFeedbacks(response, customFeedbacks);
    newVariables = { ...newVariables, ...response.newVariables };

    // Pause without writing a history entry — the resumed run will record it.
    if (response.workflowInteractiveResponse) {
      interactiveResponse = response.workflowInteractiveResponse;
      break;
    }

    // Apply `finishedNodeIds` for both success and failure paths — nodes that
    // didn't run this iteration (e.g. a skipped if-else branch) would otherwise
    // leak their previous-iteration output from `isolatedNodes`.
    const finishedNodeIds = extractFinishedNodeIds(response.flowResponses);
    const customOutputs = readCustomOutputSnapshot({
      customOutputInputs,
      runtimeNodes: isolatedNodes,
      variables: newVariables,
      finishedNodeIds,
      childrenNodeIdList
    });

    const errorItem = response.flowResponses.find((r) => r.error);
    if (errorItem) {
      loopHistory.push({
        iteration,
        customOutputs,
        success: false,
        error: getErrText(errorItem.error)
      });
      break;
    }

    loopHistory.push({ iteration, customOutputs, success: true });

    if (isLoopBreakHit(response.flowResponses)) break;

    // Resume state is one-shot; clear so subsequent iterations enter clean.
    interactiveData = undefined;

    iteration++;
  }

  const lastEntry = loopHistory[loopHistory.length - 1];
  const lastSnapshot: Record<string, any> = lastEntry?.customOutputs ?? {};
  const lastFailed = !!lastEntry && lastEntry.success === false;

  const data: Record<string, any> = {
    ...lastSnapshot
  };

  return {
    data,
    [DispatchNodeResponseKeyEnum.assistantResponses]: assistantResponses,
    [DispatchNodeResponseKeyEnum.interactive]: interactiveResponse
      ? {
          type: 'loopRunInteractive',
          params: {
            loopHistory,
            childrenResponse: interactiveResponse,
            iteration
          }
        }
      : undefined,
    [DispatchNodeResponseKeyEnum.newVariables]: newVariables,
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      totalPoints,
      loopRunInput: mode === LoopRunModeEnum.array ? inputArray : undefined,
      loopRunIterations: loopHistory.length,
      loopRunHistory: loopHistory,
      loopRunDetail: loopResponseDetail,
      mergeSignId: node.nodeId
    },
    [DispatchNodeResponseKeyEnum.customFeedbacks]:
      customFeedbacks.length > 0 ? customFeedbacks : undefined,
    ...(() => {
      if (maxIterationsExceeded) {
        return {
          error: {
            [NodeOutputKeyEnum.errorText]: `Loop execution exceeded ${maxLength} iterations`
          }
        };
      }
      if (lastFailed) {
        return {
          error: {
            [NodeOutputKeyEnum.errorText]: lastEntry?.error ?? 'loopRun failed'
          }
        };
      }
      return {};
    })()
  };
};
