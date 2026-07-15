import { batchRun } from '@fastgpt/global/common/system/utils';
import type { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { workflowSseEvent } from '@fastgpt/global/core/workflow/runtime/sse';
import {
  type DispatchNodeResultType,
  type ModuleDispatchProps
} from '@fastgpt/global/core/workflow/runtime/type';

import { serviceEnv } from '../../../../env';
import { runWorkflow } from '..';
import type { WorkflowNodeResponseWriter } from '../../../chat/nodeResponseStorage';
import { getNodeResponseChildResponseCount } from '../../../chat/nodeResponseStorage';
import {
  clampParallelConcurrency,
  clampParallelRetryTimes,
  buildTaskRuntimeContext,
  parseTaskResponse,
  parseTaskError,
  aggregateParallelResults,
  type ParallelTaskResult,
  type ParallelFullResultItem
} from './service';
import { pushSubWorkflowUsage } from '../utils';
import { createContainerRunStateSnapshot, syncContainerRunState } from '../utils/containerRunState';

type Props = ModuleDispatchProps<{
  [NodeInputKeyEnum.nestedInputArray]: Array<any>;
  [NodeInputKeyEnum.childrenNodeIdList]: string[];
  [NodeInputKeyEnum.parallelRunMaxConcurrency]?: number;
  [NodeInputKeyEnum.parallelRunMaxRetryTimes]?: number;
}> & {
  nodeResponseWriter?: WorkflowNodeResponseWriter;
  nodeResponseParentId?: string;
};

type Response = DispatchNodeResultType<{
  [NodeOutputKeyEnum.parallelSuccessResults]: Array<any>;
  [NodeOutputKeyEnum.parallelFullResults]: ParallelFullResultItem[];
  [NodeOutputKeyEnum.parallelStatus]: string;
}>;

export const dispatchParallelRun = async (props: Props): Promise<Response> => {
  const { params, runtimeNodes, runtimeEdges, node, checkIsStopping } = props;
  const { name } = node;
  const {
    loopInputArray = [],
    childrenNodeIdList = [],
    parallelRunMaxConcurrency: userConcurrency,
    parallelRunMaxRetryTimes: userRetryTimes
  } = params;

  // Input validation
  if (!Array.isArray(loopInputArray)) {
    return Promise.reject('Input value is not an array');
  }

  const maxLength = serviceEnv.WORKFLOW_MAX_LOOP_TIMES;
  if (loopInputArray.length > maxLength) {
    return Promise.reject(`Input array length cannot be greater than ${maxLength}`);
  }

  const concurrency = clampParallelConcurrency(
    userConcurrency,
    serviceEnv.WORKFLOW_PARALLEL_MAX_CONCURRENCY
  );

  const maxRetryAttempts = clampParallelRetryTimes(userRetryTimes);
  const attemptResults: ParallelTaskResult[] = [];
  const taskResponseIdPrefix = props.nodeResponseParentId || node.nodeId;

  const taskResults = await batchRun(
    loopInputArray,
    async (item: any, index: number) => {
      let lastResult: Awaited<ReturnType<typeof parseTaskResponse>> | undefined;
      // Accumulate points across all retry attempts so nodeResponse.totalPoints
      // matches the sum of all usagePush calls for this task.
      let accumulatedPoints = 0;

      for (let attempt = 0; attempt < maxRetryAttempts + 1; attempt++) {
        if (checkIsStopping()) {
          return;
        }
        const { taskRuntimeNodes, taskRuntimeEdges } = buildTaskRuntimeContext({
          runtimeNodes,
          runtimeEdges,
          childrenNodeIdList,
          item,
          index
        });
        const taskResponseId =
          maxRetryAttempts > 0
            ? `${taskResponseIdPrefix}_task_${index}_attempt_${attempt}`
            : `${taskResponseIdPrefix}_task_${index}`;
        const startTime = Date.now();
        const getRunningTime = () => +((Date.now() - startTime) / 1000).toFixed(2);

        try {
          const taskVariableState = props.variableState.clone();
          const taskStateSnapshot = createContainerRunStateSnapshot({
            nodes: taskRuntimeNodes,
            childrenNodeIdList,
            variableState: taskVariableState
          });
          const response = await runWorkflow({
            ...props,
            variableState: taskVariableState,
            nodeResponseParentId: taskResponseId,
            runtimeNodes: taskRuntimeNodes,
            runtimeEdges: taskRuntimeEdges
          });
          const runningTime = getRunningTime();

          // Push usage per attempt (resources were consumed regardless of success)
          const attemptPoints = pushSubWorkflowUsage({
            usagePush: props.usagePush,
            response,
            name,
            iteration: index
          });
          accumulatedPoints += attemptPoints;

          const result = parseTaskResponse({ index, response });
          if (result.success) {
            await syncContainerRunState({
              sourceNodes: taskRuntimeNodes,
              targetNodes: runtimeNodes,
              childrenNodeIdList,
              stateSnapshot: taskStateSnapshot,
              childVariableState: taskVariableState,
              parentVariableState: props.variableState
            });
          }
          const attemptResult = {
            ...result,
            taskResponseId,
            runningTime,
            totalPoints: attemptPoints
          };
          attemptResults.push(attemptResult);
          if (result.success) {
            return {
              ...result,
              taskResponseId,
              runningTime,
              totalPoints: accumulatedPoints
            };
          }

          // Non-retryable: interactive response will never succeed on retry
          if (response.workflowInteractiveResponse)
            return { ...result, taskResponseId, runningTime, totalPoints: accumulatedPoints };

          lastResult = {
            ...result,
            taskResponseId,
            runningTime,
            totalPoints: accumulatedPoints
          };
        } catch (err) {
          const attemptResult = {
            ...parseTaskError(index, err),
            taskResponseId,
            runningTime: getRunningTime(),
            totalPoints: 0
          };
          attemptResults.push(attemptResult);
          lastResult = { ...attemptResult, totalPoints: accumulatedPoints };
        }
        // taskRuntimeNodes / taskRuntimeEdges go out of scope → GC
      }

      return lastResult;
    },
    concurrency
  );

  const {
    filteredArray,
    fullResultsArray,
    fullDetail,
    status,
    totalPoints,
    attemptResponseDetails,
    assistantResponses,
    customFeedbacks
  } = aggregateParallelResults(
    taskResults.filter((item) => item !== undefined),
    {
      taskInputs: loopInputArray,
      parentNodeId: node.nodeId,
      attemptResults
    }
  );
  // 任务包装节点只通过 writer/event 输出；父 parallelRun 只保留轻量统计和业务摘要。
  const rootChildResponseCount = getNodeResponseChildResponseCount(attemptResponseDetails);
  if (props.nodeResponseWriter) {
    for (const detail of attemptResponseDetails) {
      const recordedWrappers = await props.nodeResponseWriter.recordWithParent(
        [
          {
            ...detail,
            childrenResponses: undefined
          }
        ],
        props.nodeResponseParentId
      );
      if (props.apiVersion === 'v2') {
        recordedWrappers.forEach((item) => {
          props.workflowStreamResponse?.(workflowSseEvent.flowNodeResponse(item));
        });
      }
    }
  }

  return {
    data: {
      [NodeOutputKeyEnum.parallelSuccessResults]: filteredArray,
      [NodeOutputKeyEnum.parallelFullResults]: fullResultsArray,
      [NodeOutputKeyEnum.parallelStatus]: status
    },
    [DispatchNodeResponseKeyEnum.assistantResponses]: assistantResponses,
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      totalPoints,
      parallelInput: loopInputArray,
      parallelResult: filteredArray,
      parallelRunDetail: fullDetail,
      childResponseCount: rootChildResponseCount
    },
    [DispatchNodeResponseKeyEnum.customFeedbacks]:
      customFeedbacks.length > 0 ? customFeedbacks : undefined
  };
};
