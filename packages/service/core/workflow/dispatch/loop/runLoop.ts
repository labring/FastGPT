import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
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

type Props = ModuleDispatchProps<{
  [NodeInputKeyEnum.loopInputArray]: Array<any>;
  [NodeInputKeyEnum.childrenNodeIdList]: string[];
}>;
type Response = DispatchNodeResultType<{
  [NodeOutputKeyEnum.loopArray]: Array<any>;
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
  const maxLength = process.env.WORKFLOW_MAX_LOOP_TIMES
    ? Number(process.env.WORKFLOW_MAX_LOOP_TIMES)
    : 50;
  if (loopInputArray.length > maxLength) {
    return Promise.reject(`Input array length cannot be greater than ${maxLength}`);
  }

  let interactiveData =
    lastInteractive?.type === 'loopInteractive' ? lastInteractive?.params : undefined;
  let lastIndex = interactiveData?.currentIndex;

  const outputValueArr = interactiveData ? interactiveData.loopResult : [];
  const loopResponseDetail: ChatHistoryItemResType[] = [];
  let assistantResponses: AIChatItemValueItemType[] = [];
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
      runtimeNodes.forEach((node) => {
        if (!childrenNodeIdList.includes(node.nodeId)) return;

        // Init interactive response
        if (node.flowNodeType === FlowNodeTypeEnum.loopStart) {
          node.isEntry = true;
          node.inputs.forEach((input) => {
            if (input.key === NodeInputKeyEnum.loopStartInput) {
              input.value = item;
            } else if (input.key === NodeInputKeyEnum.loopStartIndex) {
              input.value = index + 1;
            }
          });
        }
      });
    }

    index++;

    const response = await runWorkflow({
      ...props,
      usageId: undefined,
      lastInteractive: interactiveData?.childrenResponse,
      variables: newVariables,
      runtimeNodes,
      runtimeEdges: cloneDeep(
        storeEdges2RuntimeEdges(runtimeEdges, interactiveData?.childrenResponse)
      )
    });

    const loopOutputValue = response.flowResponses.find(
      (res) => res.moduleType === FlowNodeTypeEnum.loopEnd
    )?.loopOutputValue;

    // Concat runtime response
    if (!response.workflowInteractiveResponse) {
      outputValueArr.push(loopOutputValue);
    }
    loopResponseDetail.push(...response.flowResponses);
    assistantResponses.push(...response.assistantResponses);
    totalPoints += response.flowUsages.reduce((acc, usage) => acc + usage.totalPoints, 0);

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
      [NodeOutputKeyEnum.loopArray]: outputValueArr
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
    [DispatchNodeResponseKeyEnum.nodeDispatchUsages]: totalPoints
      ? [
          {
            totalPoints,
            moduleName: name
          }
        ]
      : [],
    [DispatchNodeResponseKeyEnum.newVariables]: newVariables
  };
};
