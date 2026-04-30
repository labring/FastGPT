import { batchRun } from '@fastgpt/global/common/system/utils';
import type { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import {
  type DispatchNodeResultType,
  type ModuleDispatchProps
} from '@fastgpt/global/core/workflow/runtime/type';

import { env } from '../../../../env';
import { runWorkflow } from '..';
import { cloneDeep } from 'lodash';
import {
  clampParallelConcurrency,
  clampParallelRetryTimes,
  buildTaskRuntimeContext,
  parseTaskResponse,
  parseTaskError,
  aggregateParallelResults,
  type ParallelFullResultItem
} from './service';
import { pushSubWorkflowUsage } from '../utils';

type Props = ModuleDispatchProps<{
  [NodeInputKeyEnum.nestedInputArray]: Array<any>;
  [NodeInputKeyEnum.childrenNodeIdList]: string[];
  [NodeInputKeyEnum.parallelRunMaxConcurrency]?: number;
  [NodeInputKeyEnum.parallelRunMaxRetryTimes]?: number;
}>;

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

  const maxLength = env.WORKFLOW_MAX_LOOP_TIMES;
  if (loopInputArray.length > maxLength) {
    return Promise.reject(`Input array length cannot be greater than ${maxLength}`);
  }

  const concurrency = clampParallelConcurrency(
    userConcurrency,
    env.WORKFLOW_PARALLEL_MAX_CONCURRENCY
  );

  const maxRetryAttempts = clampParallelRetryTimes(userRetryTimes);

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

        try {
          const response = await runWorkflow({
            ...props,
            variables: cloneDeep(props.variables),
            runtimeNodes: taskRuntimeNodes,
            runtimeEdges: taskRuntimeEdges
          });

          // Push usage per attempt (resources were consumed regardless of success)
          accumulatedPoints += pushSubWorkflowUsage({
            usagePush: props.usagePush,
            response,
            name,
            iteration: index
          });

          const result = parseTaskResponse({ index, response });
          if (result.success) return { ...result, totalPoints: accumulatedPoints };

          // Non-retryable: interactive response will never succeed on retry
          if (response.workflowInteractiveResponse)
            return { ...result, totalPoints: accumulatedPoints };

          lastResult = { ...result, totalPoints: accumulatedPoints };
        } catch (err) {
          lastResult = { ...parseTaskError(index, err), totalPoints: accumulatedPoints };
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
    responseDetails,
    assistantResponses,
    customFeedbacks
  } = aggregateParallelResults(
    taskResults.filter((item) => item !== undefined),
    {
      taskInputs: loopInputArray,
      parentNodeId: node.nodeId
    }
  );

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
      parallelDetail: responseDetails,
      mergeSignId: node.nodeId
    },
    [DispatchNodeResponseKeyEnum.customFeedbacks]:
      customFeedbacks.length > 0 ? customFeedbacks : undefined
  };
};
