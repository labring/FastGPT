import { batchRun } from '@fastgpt/global/common/system/utils';
import type { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import {
  type DispatchNodeResultType,
  type ModuleDispatchProps
} from '@fastgpt/global/core/workflow/runtime/type';

import { serviceEnv } from '../../../../env';
import { runWorkflow } from '..';
import type { WorkflowNodeResponseWriter } from '../../../chat/nodeResponseStorage';
import { getNodeResponseChildStats } from '../../../chat/nodeResponseStorage';
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
}> & {
  nodeResponseWriter?: WorkflowNodeResponseWriter;
  nodeResponseParentId?: string;
};

type Response = DispatchNodeResultType<{
  [NodeOutputKeyEnum.parallelSuccessResults]: Array<any>;
  [NodeOutputKeyEnum.parallelFullResults]: ParallelFullResultItem[];
  [NodeOutputKeyEnum.parallelStatus]: string;
}>;

const getResponseIdsForCleanup = ({
  taskResponseId,
  response
}: {
  taskResponseId: string;
  response?: Awaited<ReturnType<typeof runWorkflow>>;
}) => [
  taskResponseId,
  ...((response?.flowResponses || []).map((item) => item.id).filter(Boolean) as string[])
];

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

  const taskResults = await batchRun(
    loopInputArray,
    async (item: any, index: number) => {
      let lastResult: Awaited<ReturnType<typeof parseTaskResponse>> | undefined;
      // Accumulate points across all retry attempts so nodeResponse.totalPoints
      // matches the sum of all usagePush calls for this task.
      let accumulatedPoints = 0;
      const taskAttemptResponseIdGroups: string[][] = [];

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
            ? `${node.nodeId}_task_${index}_attempt_${attempt}`
            : `${node.nodeId}_task_${index}`;

        try {
          const response = await runWorkflow({
            ...props,
            variableState: props.variableState.clone(),
            nodeResponseParentId: taskResponseId,
            runtimeNodes: taskRuntimeNodes,
            runtimeEdges: taskRuntimeEdges
          });
          const currentAttemptResponseIds = getResponseIdsForCleanup({ taskResponseId, response });
          taskAttemptResponseIdGroups.push(currentAttemptResponseIds);

          // Push usage per attempt (resources were consumed regardless of success)
          accumulatedPoints += pushSubWorkflowUsage({
            usagePush: props.usagePush,
            response,
            name,
            iteration: index
          });

          const result = parseTaskResponse({ index, response });
          if (result.success) {
            if (props.nodeResponseWriter && taskAttemptResponseIdGroups.length > 1) {
              await props.nodeResponseWriter.deleteResponses(
                taskAttemptResponseIdGroups.slice(0, -1).flat()
              );
            }
            return {
              ...result,
              taskResponseId,
              totalPoints: accumulatedPoints
            };
          }

          // Non-retryable: interactive response will never succeed on retry
          if (response.workflowInteractiveResponse)
            return { ...result, taskResponseId, totalPoints: accumulatedPoints };

          lastResult = { ...result, taskResponseId, totalPoints: accumulatedPoints };
        } catch (err) {
          taskAttemptResponseIdGroups.push(getResponseIdsForCleanup({ taskResponseId }));
          lastResult = {
            ...parseTaskError(index, err),
            taskResponseId,
            totalPoints: accumulatedPoints
          };
        }
        // taskRuntimeNodes / taskRuntimeEdges go out of scope → GC
      }

      if (props.nodeResponseWriter && taskAttemptResponseIdGroups.length > 1) {
        await props.nodeResponseWriter.deleteResponses(
          taskAttemptResponseIdGroups.slice(0, -1).flat()
        );
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
  const rootChildStats = getNodeResponseChildStats(responseDetails);
  const finalResponseDetails = await (async () => {
    if (!props.nodeResponseWriter) return responseDetails;

    const slimDetails: typeof responseDetails = [];
    for (const detail of responseDetails) {
      const childrenResponses = detail.childrenResponses || [];
      const childStats = getNodeResponseChildStats(childrenResponses);
      await props.nodeResponseWriter.recordWithParent(
        [
          {
            ...detail,
            childResponseCount: childStats.childResponseCount,
            childTotalPoints: childStats.childTotalPoints,
            childrenResponses: undefined
          }
        ],
        props.nodeResponseParentId
      );
      slimDetails.push({
        ...detail,
        childResponseCount: childStats.childResponseCount,
        childTotalPoints: childStats.childTotalPoints,
        childrenResponses: undefined
      });
    }

    return slimDetails;
  })();

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
      childResponseCount: rootChildStats.childResponseCount,
      childTotalPoints: rootChildStats.childTotalPoints,
      ...(props.nodeResponseWriter ? {} : { parallelDetail: finalResponseDetails }),
      mergeSignId: node.nodeId
    },
    [DispatchNodeResponseKeyEnum.customFeedbacks]:
      customFeedbacks.length > 0 ? customFeedbacks : undefined
  };
};
