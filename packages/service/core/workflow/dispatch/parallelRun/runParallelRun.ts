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
import {
  clampParallelConcurrency,
  buildTaskRuntimeContext,
  cloneTaskVariables,
  parseTaskResponse,
  parseTaskError,
  aggregateParallelResults,
  type ParallelFullResultItem
} from './service';

type Props = ModuleDispatchProps<{
  [NodeInputKeyEnum.nestedInputArray]: Array<any>;
  [NodeInputKeyEnum.childrenNodeIdList]: string[];
  [NodeInputKeyEnum.parallelRunMaxConcurrency]?: number;
}>;

type Response = DispatchNodeResultType<{
  [NodeOutputKeyEnum.parallelSuccessResults]: Array<any>;
  [NodeOutputKeyEnum.parallelFullResults]: ParallelFullResultItem[];
  [NodeOutputKeyEnum.parallelStatus]: string;
}>;

export const dispatchParallelRun = async (props: Props): Promise<Response> => {
  const { params, runtimeNodes, runtimeEdges, node } = props;
  const { name } = node;
  const {
    loopInputArray = [],
    childrenNodeIdList = [],
    parallelRunMaxConcurrency: userConcurrency
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

  // batchRun: per-task lazy clone — peak memory = concurrency * subgraph size
  const MAX_RETRY_ATTEMPTS = 3;

  const taskResults = await batchRun(
    loopInputArray,
    async (item: any, index: number) => {
      let lastResult: Awaited<ReturnType<typeof parseTaskResponse>> | undefined;

      for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt++) {
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
            // TC0034: isolate variables — see cloneTaskVariables JSDoc
            variables: cloneTaskVariables(props.variables),
            runtimeNodes: taskRuntimeNodes,
            runtimeEdges: taskRuntimeEdges
          });

          // Push usage per attempt (resources were consumed regardless of success)
          const itemUsagePoint = response.flowUsages.reduce(
            (acc, usage) => acc + usage.totalPoints,
            0
          );
          props.usagePush([
            {
              totalPoints: itemUsagePoint,
              moduleName: `${name}-${index}`
            }
          ]);

          const result = parseTaskResponse({ index, response });
          if (result.success) return result;

          // Non-retryable: interactive response will never succeed on retry
          if (response.workflowInteractiveResponse) return result;

          lastResult = result;
        } catch (err) {
          lastResult = parseTaskError(index, err);
        }
        // taskRuntimeNodes / taskRuntimeEdges go out of scope → GC
      }

      return lastResult!;
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
  } = aggregateParallelResults(taskResults);

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
