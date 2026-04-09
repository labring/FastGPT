import { batchRun } from '@fastgpt/global/common/system/utils';
import type { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import {
  type DispatchNodeResultType,
  type ModuleDispatchProps
} from '@fastgpt/global/core/workflow/runtime/type';
import type { StoreEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
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
  const taskResults = await batchRun(
    loopInputArray,
    async (item: any, index: number) => {
      const { taskRuntimeNodes, taskRuntimeEdges } = buildTaskRuntimeContext({
        runtimeNodes,
        runtimeEdges: runtimeEdges as unknown as StoreEdgeItemType[], // RuntimeEdgeItemType ⊃ StoreEdgeItemType
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

        // Push usage per task immediately (mirror runLoop pattern)
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

        return parseTaskResponse({ index, response });
      } catch (err) {
        return parseTaskError(index, err);
      }
      // taskRuntimeNodes / taskRuntimeEdges go out of scope → GC
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
