import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import {
  DispatchNodeResultType,
  ModuleDispatchProps
} from '@fastgpt/global/core/workflow/runtime/type';
import { dispatchWorkFlow } from '..';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { AIChatItemValueItemType, ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';

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
    runtimeNodes,
    user,
    node: { name }
  } = props;
  const { loopInputArray = [], childrenNodeIdList } = params;

  if (!Array.isArray(loopInputArray)) {
    return Promise.reject('Input value is not an array');
  }
  if (loopInputArray.length > 50) {
    return Promise.reject('Input array length cannot be greater than 50');
  }

  const runNodes = runtimeNodes.filter((node) => childrenNodeIdList.includes(node.nodeId));

  const outputValueArr = [];
  const loopDetail: ChatHistoryItemResType[] = [];
  let assistantResponses: AIChatItemValueItemType[] = [];
  let totalPoints = 0;
  let newVariables: Record<string, any> = props.variables;

  for await (const item of loopInputArray) {
    const response = await dispatchWorkFlow({
      ...props,
      runtimeNodes: runNodes.map((node) =>
        node.flowNodeType === FlowNodeTypeEnum.loopStart
          ? {
              ...node,
              isEntry: true,
              inputs: node.inputs.map((input) =>
                input.key === NodeInputKeyEnum.loopStartInput
                  ? {
                      ...input,
                      value: item
                    }
                  : input
              )
            }
          : {
              ...node,
              isEntry: false
            }
      )
    });

    const loopOutputValue = response.flowResponses.find(
      (res) => res.moduleType === FlowNodeTypeEnum.loopEnd
    )?.loopOutputValue;

    outputValueArr.push(loopOutputValue);
    loopDetail.push(...response.flowResponses);
    assistantResponses.push(...response.assistantResponses);

    totalPoints = response.flowUsages.reduce((acc, usage) => acc + usage.totalPoints, 0);
    newVariables = {
      ...newVariables,
      ...response.newVariables
    };
  }

  return {
    [DispatchNodeResponseKeyEnum.assistantResponses]: assistantResponses,
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      totalPoints: totalPoints,
      loopInput: loopInputArray,
      loopResult: outputValueArr,
      loopDetail: loopDetail
    },
    [DispatchNodeResponseKeyEnum.nodeDispatchUsages]: [
      {
        totalPoints: user.openaiAccount?.key ? 0 : totalPoints,
        moduleName: name
      }
    ],
    [NodeOutputKeyEnum.loopArray]: outputValueArr,
    [DispatchNodeResponseKeyEnum.newVariables]: newVariables
  };
};
