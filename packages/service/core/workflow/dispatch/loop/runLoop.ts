import type { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  type DispatchNodeResultType,
  type ModuleDispatchProps
} from '@fastgpt/global/core/workflow/runtime/type';
import { runWorkflow } from '..';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import {
  type AIChatItemValueItemType,
  type ChatHistoryItemResType
} from '@fastgpt/global/core/chat/type';
import { cloneDeep } from 'lodash';
import { type WorkflowInteractiveResponseType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { storeEdges2RuntimeEdges } from '@fastgpt/global/core/workflow/runtime/utils';
import { env } from '../../../../env';
import { getNestedEndOutputValue } from './service';
import { collectResponseFeedbacks, injectNestedStartInputs, pushSubWorkflowUsage } from '../utils';

type Props = ModuleDispatchProps<{
  [NodeInputKeyEnum.nestedInputArray]: Array<any>;
  [NodeInputKeyEnum.childrenNodeIdList]: string[];
}>;
type Response = DispatchNodeResultType<{
  [NodeOutputKeyEnum.nestedArrayResult]: Array<any>;
}>;

export const dispatchLoop = async (props: Props): Promise<Response> => {
  const {
    params,
    runtimeEdges,
    lastInteractive,
    runtimeNodes,
    node: { name }
  } = props;
  const { loopInputArray = [], childrenNodeIdList = [] } = params;

  if (!Array.isArray(loopInputArray)) {
    return Promise.reject('Input value is not an array');
  }

  // Max loop times
  const maxLength = env.WORKFLOW_MAX_LOOP_TIMES;
  if (loopInputArray.length > maxLength) {
    return Promise.reject(`Input array length cannot be greater than ${maxLength}`);
  }

  let interactiveData =
    lastInteractive?.type === 'loopInteractive' ? lastInteractive?.params : undefined;
  let lastIndex = interactiveData?.currentIndex;

  const outputValueArr = interactiveData ? interactiveData.loopResult : [];
  const loopResponseDetail: ChatHistoryItemResType[] = [];
  let assistantResponses: AIChatItemValueItemType[] = [];
  const customFeedbacks: string[] = [];
  let totalPoints = 0;
  let newVariables: Record<string, any> = props.variables;
  let interactiveResponse: WorkflowInteractiveResponseType | undefined = undefined;
  let index = 0;

  for await (const item of loopInputArray) {
    // Skip already looped
    if (lastIndex && index < lastIndex) {
      index++;
      continue;
    }

    // It takes effect only once in current loop
    const isInteractiveResponseIndex = !!interactiveData && index === interactiveData?.currentIndex;

    // Init entry
    if (isInteractiveResponseIndex) {
      runtimeNodes.forEach((node) => {
        if (interactiveData?.childrenResponse?.entryNodeIds.includes(node.nodeId)) {
          node.isEntry = true;
        }
      });
    } else {
      injectNestedStartInputs({ nodes: runtimeNodes, childrenNodeIdList, item, index });
    }

    index++;

    const response = await runWorkflow({
      ...props,
      lastInteractive: interactiveData?.childrenResponse,
      variables: newVariables,
      runtimeNodes,
      runtimeEdges: cloneDeep(
        storeEdges2RuntimeEdges(runtimeEdges, interactiveData?.childrenResponse)
      )
    });

    // Concat runtime response
    if (!response.workflowInteractiveResponse) {
      outputValueArr.push(getNestedEndOutputValue(response));
    }
    loopResponseDetail.push(...response.flowResponses);
    assistantResponses.push(...response.assistantResponses);

    totalPoints += pushSubWorkflowUsage({
      usagePush: props.usagePush,
      response,
      name,
      iteration: index
    });

    collectResponseFeedbacks(response, customFeedbacks);

    // Concat new variables
    newVariables = {
      ...newVariables,
      ...response.newVariables
    };

    // handle interactive response
    if (response.workflowInteractiveResponse) {
      interactiveResponse = response.workflowInteractiveResponse;
      break;
    }

    // Clear last interactive data, avoid being influenced by the previous round of interaction
    interactiveData = undefined;
    lastIndex = undefined;
  }

  return {
    data: {
      [NodeOutputKeyEnum.nestedArrayResult]: outputValueArr
    },
    [DispatchNodeResponseKeyEnum.interactive]: interactiveResponse
      ? {
          type: 'loopInteractive',
          params: {
            currentIndex: index - 1,
            childrenResponse: interactiveResponse,
            loopResult: outputValueArr
          }
        }
      : undefined,
    [DispatchNodeResponseKeyEnum.assistantResponses]: assistantResponses,
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      totalPoints,
      loopInput: loopInputArray,
      loopResult: outputValueArr,
      loopDetail: loopResponseDetail,
      mergeSignId: props.node.nodeId
    },
    [DispatchNodeResponseKeyEnum.newVariables]: newVariables,
    [DispatchNodeResponseKeyEnum.customFeedbacks]:
      customFeedbacks.length > 0 ? customFeedbacks : undefined
  };
};
