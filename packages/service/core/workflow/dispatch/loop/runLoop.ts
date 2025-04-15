import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import {
  DispatchNodeResultType,
  ModuleDispatchProps
} from '@fastgpt/global/core/workflow/runtime/type';
import { dispatchWorkFlow } from '..';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { AIChatItemValueItemType, ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import { cloneDeep } from 'lodash';
import {
  LoopInteractive,
  WorkflowInteractiveResponseType
} from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { initWorkflowEdgeStatus } from '@fastgpt/global/core/workflow/runtime/utils';

type Props = ModuleDispatchProps<{
  [NodeInputKeyEnum.loopInputArray]: Array<any>;
  [NodeInputKeyEnum.childrenNodeIdList]: string[];
}>;
type Response = DispatchNodeResultType<{
  [DispatchNodeResponseKeyEnum.interactive]?: LoopInteractive;
  [NodeOutputKeyEnum.loopArray]: Array<any>;
}>;

export const dispatchLoop = async (props: Props): Promise<Response> => {
  const {
    params,
    runtimeEdges,
    query,
    lastInteractive,
    runtimeNodes,
    node: { name }
  } = props;
  const { loopInputArray = [], childrenNodeIdList = [] } = params;

  if (!Array.isArray(loopInputArray)) {
    return Promise.reject('Input value is not an array');
  }
  const maxLength = process.env.WORKFLOW_MAX_LOOP_TIMES
    ? Number(process.env.WORKFLOW_MAX_LOOP_TIMES)
    : 50;
  if (loopInputArray.length > maxLength) {
    return Promise.reject(`Input array length cannot be greater than ${maxLength}`);
  }

  let outputValueArr = [];
  const loopDetail: ChatHistoryItemResType[] = [];
  let assistantResponses: AIChatItemValueItemType[] = [];
  let totalPoints = 0;
  let newVariables: Record<string, any> = props.variables;
  let interactiveResponse: WorkflowInteractiveResponseType | undefined = undefined;

  const { params: loopParams } = lastInteractive?.type === 'loopInteractive' ? lastInteractive : {};
  const childrenInteractive = loopParams?.childrenResponse;
  const currentIndex = loopParams?.currentIndex;
  let index = 0;
  if (childrenInteractive) {
    outputValueArr = loopParams.loopResult || [];
  }

  const entryNodeIds = childrenInteractive?.entryNodeIds;

  for await (const item of loopInputArray.filter(Boolean)) {
    if (currentIndex && index < currentIndex) {
      index++;
      continue;
    }
    const rightNowIndex = index === currentIndex;
    runtimeNodes.forEach((node) => {
      if (
        (childrenNodeIdList.includes(node.nodeId) &&
          node.flowNodeType === FlowNodeTypeEnum.loopStart) ||
        (rightNowIndex && entryNodeIds?.includes(node.nodeId))
      ) {
        node.isEntry = !(rightNowIndex && node.flowNodeType === FlowNodeTypeEnum.loopStart);
        node.inputs.forEach((input) => {
          if (input.key === NodeInputKeyEnum.loopStartInput) {
            input.value = item;
          } else if (input.key === NodeInputKeyEnum.loopStartIndex) {
            input.value = index++;
          }
        });
      }
    });

    const response = await dispatchWorkFlow({
      ...props,
      query,
      lastInteractive: childrenInteractive,
      variables: newVariables,
      runtimeNodes,
      runtimeEdges: cloneDeep(
        rightNowIndex ? initWorkflowEdgeStatus(runtimeEdges, childrenInteractive) : runtimeEdges
      )
    });

    const loopOutputValue = response.flowResponses.find(
      (res) => res.moduleType === FlowNodeTypeEnum.loopEnd
    )?.loopOutputValue;

    // Concat runtime response
    outputValueArr.push(loopOutputValue);
    loopDetail.push(...response.flowResponses);
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
      outputValueArr.pop();
      break;
    }
  }

  return {
    [DispatchNodeResponseKeyEnum.interactive]: interactiveResponse
      ? {
          type: 'loopInteractive',
          params: {
            currentIndex: index - 1,
            childrenResponse: interactiveResponse,
            loopDetail: loopDetail,
            loopInput: loopInputArray,
            loopResult: outputValueArr
          }
        }
      : undefined,
    [DispatchNodeResponseKeyEnum.assistantResponses]: assistantResponses,
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      totalPoints,
      loopInput: loopInputArray,
      loopResult: outputValueArr,
      loopDetail: loopDetail
    },
    [DispatchNodeResponseKeyEnum.nodeDispatchUsages]: [
      {
        totalPoints,
        moduleName: name
      }
    ],
    [NodeOutputKeyEnum.loopArray]: outputValueArr,
    [DispatchNodeResponseKeyEnum.newVariables]: newVariables
  };
};
