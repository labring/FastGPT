import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import { i18nT } from '../../../../../web/i18n/utils';
import {
  type DispatchNodeResultType,
  type ModuleDispatchProps
} from '@fastgpt/global/core/workflow/runtime/type';
import { runWorkflow } from '..';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { cloneDeep } from 'lodash';
import { storeEdges2RuntimeEdges } from '@fastgpt/global/core/workflow/runtime/utils';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { batchRun } from '@fastgpt/global/common/system/utils';
import { env } from '../../../../env';

/** 节点响应里是否带有需关注的错误（开启 catch 的节点仅作记录，不参与批量成败） */
const flowResponseHasError = (res: ChatHistoryItemResType) => {
  if (res.errorText) return true;
  if (res.error == null || res.error === '') return false;
  if (typeof res.error === 'string') return true;
  if (typeof res.error === 'object' && Object.keys(res.error).length > 0) return true;
  return Boolean(res.error);
};

const formatFlowResponseError = (res: ChatHistoryItemResType) => {
  if (res.errorText) return res.errorText;
  if (typeof res.error === 'string') return res.error;
  if (res.error && typeof res.error === 'object') return getErrText(res.error);
  return res.moduleName || res.nodeId;
};

/** 子画布内未开启「错误时继续」的节点若带 error，则本批元素视为失败 */
const collectBatchChildUncaughtErrors = (
  flowResponses: ChatHistoryItemResType[],
  childrenNodeIdList: string[],
  catchErrorByNodeId: Map<string, boolean | undefined>
) => {
  const messages: string[] = [];
  for (const res of flowResponses) {
    if (!childrenNodeIdList.includes(res.nodeId)) continue;
    if (catchErrorByNodeId.get(res.nodeId)) continue;
    if (!flowResponseHasError(res)) continue;
    messages.push(`${res.moduleName}: ${formatFlowResponseError(res)}`);
  }
  return messages;
};

type BatchRawResultItem = {
  success: boolean;
  message?: string;
  data?: any;
};

type Props = ModuleDispatchProps<{
  [NodeInputKeyEnum.loopInputArray]: Array<any>;
  [NodeInputKeyEnum.childrenNodeIdList]: string[];
  [NodeInputKeyEnum.batchParallelConcurrency]?: number;
  [NodeInputKeyEnum.batchParallelRetryTimes]?: number;
}>;
type Response = DispatchNodeResultType<{
  [NodeOutputKeyEnum.loopArray]: Array<any>;
  [NodeOutputKeyEnum.batchRawResult]: BatchRawResultItem[];
  [NodeOutputKeyEnum.batchStatus]: 'success' | 'failed' | 'partial_success';
}>;

const getRuntimeConcurrency = (raw: any) => {
  const num = Math.floor(Number(raw));
  const upper = Math.min(env.WORKFLOW_BATCH_MAX_CONCURRENCY, env.WORKFLOW_MAX_LOOP_TIMES);
  if (!Number.isFinite(num)) return 5;
  return Math.max(5, Math.min(upper, num));
};
const getRuntimeRetry = (raw: any) => {
  const num = Math.floor(Number(raw));
  if (!Number.isFinite(num)) return 3;
  return Math.max(0, Math.min(env.WORKFLOW_BATCH_MAX_RETRY, num));
};

const assertBatchChildNodes = ({
  childrenNodeIdList,
  runtimeNodes
}: {
  childrenNodeIdList: string[];
  runtimeNodes: Props['runtimeNodes'];
}) => {
  const forbiddenTypes = new Set<FlowNodeTypeEnum>([
    FlowNodeTypeEnum.loop,
    FlowNodeTypeEnum.batch,
    FlowNodeTypeEnum.loopPro,
    FlowNodeTypeEnum.loopProEnd,
    FlowNodeTypeEnum.userSelect,
    FlowNodeTypeEnum.formInput
  ]);

  const hasForbidden = runtimeNodes.some(
    (node) => childrenNodeIdList.includes(node.nodeId) && forbiddenTypes.has(node.flowNodeType)
  );
  if (hasForbidden) {
    throw new Error('Batch child workflow does not allow loop/batch/loop_pro/interactive nodes');
  }
};

export const dispatchBatch = async (props: Props): Promise<Response> => {
  const {
    params,
    runtimeEdges,
    runtimeNodes,
    node: { name }
  } = props;
  const {
    loopInputArray = [],
    childrenNodeIdList = [],
    batchParallelConcurrency = 5,
    batchParallelRetryTimes = 3
  } = params;

  if (!Array.isArray(loopInputArray)) {
    return Promise.reject('Input value is not an array');
  }

  await assertBatchChildNodes({
    childrenNodeIdList,
    runtimeNodes
  });

  const maxLength = env.WORKFLOW_MAX_LOOP_TIMES;
  if (loopInputArray.length > maxLength) {
    return Promise.reject(i18nT('workflow:loop_max_reached'));
  }

  if (loopInputArray.length === 0) {
    return {
      data: {
        [NodeOutputKeyEnum.loopArray]: [],
        [NodeOutputKeyEnum.batchRawResult]: [],
        [NodeOutputKeyEnum.batchStatus]: 'success'
      },
      [DispatchNodeResponseKeyEnum.nodeResponse]: {
        totalPoints: 0,
        batchInput: loopInputArray,
        batchResult: [],
        batchRawResult: [],
        batchStatus: 'success',
        mergeSignId: props.node.nodeId
      }
    };
  }

  const concurrency = getRuntimeConcurrency(batchParallelConcurrency);
  const retryTimes = getRuntimeRetry(batchParallelRetryTimes);

  const catchErrorByNodeId = new Map<string, boolean | undefined>();
  runtimeNodes.forEach((n) => {
    if (childrenNodeIdList.includes(n.nodeId)) {
      catchErrorByNodeId.set(n.nodeId, n.catchError);
    }
  });

  const orderedRawResult: BatchRawResultItem[] = new Array(loopInputArray.length);
  const orderedSuccessResult: any[] = [];
  const detailResponses: any[] = [];
  let totalPoints = 0;
  const customFeedbacks: string[] = [];

  const runOne = async (item: any, index: number) => {
    let attempt = 0;
    while (attempt <= retryTimes) {
      try {
        const taskRuntimeNodes = cloneDeep(runtimeNodes);
        taskRuntimeNodes.forEach((node) => {
          if (!childrenNodeIdList.includes(node.nodeId)) return;
          if (node.flowNodeType !== FlowNodeTypeEnum.loopStart) return;

          node.isEntry = true;
          node.inputs.forEach((input) => {
            if (input.key === NodeInputKeyEnum.loopStartInput) {
              input.value = item;
            } else if (input.key === NodeInputKeyEnum.loopStartIndex) {
              input.value = index + 1;
            }
          });
        });

        // if (process.env.NODE_ENV !== 'production') {
        //   console.log('[dispatchBatch] runWorkflow try', {
        //     batchModule: name,
        //     itemIndex: index,
        //     attempt,
        //     retryTimesLimit: retryTimes
        //   });
        // }

        const response = await runWorkflow({
          ...props,
          usageId: undefined,
          lastInteractive: undefined,
          runtimeNodes: taskRuntimeNodes,
          runtimeEdges: cloneDeep(storeEdges2RuntimeEdges(runtimeEdges, undefined))
        });

        if (response.workflowInteractiveResponse) {
          throw new Error('Batch child workflow does not allow interactive nodes');
        }

        const flowResponses = response.flowResponses as ChatHistoryItemResType[];
        const loopEndList = flowResponses.filter(
          (res) => res.moduleType === FlowNodeTypeEnum.loopEnd
        );
        const loopOutputValue = loopEndList[loopEndList.length - 1]?.loopOutputValue;

        const uncaughtErrors = collectBatchChildUncaughtErrors(
          flowResponses,
          childrenNodeIdList,
          catchErrorByNodeId
        );
        const reachedLoopEnd = loopEndList.length > 0;
        const outputHasData = loopOutputValue !== undefined && loopOutputValue !== null;

        const failMessages: string[] = [...uncaughtErrors];
        if (!reachedLoopEnd) {
          failMessages.push(i18nT('workflow:batch_child_not_reach_loop_end'));
        } else if (!outputHasData) {
          failMessages.push(i18nT('workflow:batch_child_loop_output_invalid'));
        }

        if (failMessages.length > 0) {
          orderedRawResult[index] = {
            success: false,
            message: failMessages.join('\n')
          };
        } else {
          orderedRawResult[index] = {
            success: true,
            data: loopOutputValue
          };
          orderedSuccessResult.push({
            index,
            data: loopOutputValue
          });
        }

        detailResponses.push(...response.flowResponses);
        totalPoints += response.flowUsages.reduce((acc, usage) => acc + usage.totalPoints, 0);
        if (response[DispatchNodeResponseKeyEnum.customFeedbacks]) {
          customFeedbacks.push(...response[DispatchNodeResponseKeyEnum.customFeedbacks]);
        }
        return;
      } catch (error) {
        // if (process.env.NODE_ENV !== 'production') {
        //   console.warn('[dispatchBatch] runWorkflow error', {
        //     batchModule: name,
        //     itemIndex: index,
        //     attempt,
        //     error: getErrText(error),
        //     willRetry: attempt < retryTimes
        //   });
        // }
        attempt++;
        if (attempt > retryTimes) {
          orderedRawResult[index] = {
            success: false,
            message: getErrText(error)
          };
        }
      }
    }
  };

  await batchRun(loopInputArray, runOne, concurrency);

  let successCount = 0;
  let failedCount = 0;
  for (let i = 0; i < orderedRawResult.length; i++) {
    const item = orderedRawResult[i];
    if (!item) {
      failedCount++;
      continue;
    }
    if (item.success) successCount++;
    else failedCount++;
  }
  const status: 'success' | 'failed' | 'partial_success' =
    failedCount === 0 ? 'success' : successCount === 0 ? 'failed' : 'partial_success';

  const sortedSuccessResult = orderedSuccessResult
    .sort((a, b) => a.index - b.index)
    .map((item) => item.data);

  return {
    data: {
      [NodeOutputKeyEnum.loopArray]: sortedSuccessResult,
      [NodeOutputKeyEnum.batchRawResult]: orderedRawResult,
      [NodeOutputKeyEnum.batchStatus]: status
    },
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      totalPoints,
      batchInput: loopInputArray,
      batchResult: sortedSuccessResult,
      batchRawResult: orderedRawResult,
      batchStatus: status,
      batchDetail: detailResponses,
      mergeSignId: props.node.nodeId
    },
    [DispatchNodeResponseKeyEnum.nodeDispatchUsages]: totalPoints
      ? [
          {
            totalPoints,
            moduleName: name
          }
        ]
      : [],
    [DispatchNodeResponseKeyEnum.customFeedbacks]:
      customFeedbacks.length > 0 ? customFeedbacks : undefined
  };
};
