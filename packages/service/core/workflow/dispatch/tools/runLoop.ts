import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import {
  DispatchNodeResultType,
  ModuleDispatchProps
} from '@fastgpt/global/core/workflow/runtime/type';
import { dispatchWorkFlow } from '..';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';

type Props = ModuleDispatchProps<{
  [NodeInputKeyEnum.loopInputArray]: Array<any>;
  [NodeInputKeyEnum.loopFlow]: { childNodes: Array<string> };
}>;
type Response = DispatchNodeResultType<{
  [NodeOutputKeyEnum.loopArray]: Array<any>;
}>;

export const dispatchLoop = async (props: Props): Promise<Response> => {
  const { params, runtimeNodes } = props;
  const {
    loopInputArray,
    loopFlow: { childNodes }
  } = params;
  const runNodes = runtimeNodes.filter((node) => childNodes.includes(node.nodeId));
  const outputArray = [];
  const loopDetail: ChatHistoryItemResType[] = [];
  let totalPoints = 0;
  let totalTokens = 0;

  for await (const element of loopInputArray) {
    const response = await dispatchWorkFlow({
      ...props,
      runtimeNodes: runNodes.map((node) =>
        node.flowNodeType === FlowNodeTypeEnum.loopStart
          ? {
              ...node,
              isEntry: true,
              inputs: node.inputs.map((input) =>
                input.key === NodeInputKeyEnum.loopArrayElement
                  ? {
                      ...input,
                      value: element
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
    const loopOutputElement = response.flowResponses.find(
      (res) => res.moduleType === FlowNodeTypeEnum.loopEnd
    )?.loopOutputElement;
    outputArray.push(loopOutputElement);
    loopDetail.push(...response.flowResponses);
    response.flowResponses.forEach((res) => {
      totalPoints = totalPoints + (res.totalPoints ?? 0);
      totalTokens = totalTokens + (res.tokens ?? 0);
    });
  }

  return {
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      totalPoints: totalPoints,
      tokens: totalTokens,
      loopInput: loopInputArray,
      loopResult: outputArray,
      loopDetail: loopDetail
    },
    [NodeOutputKeyEnum.loopArray]: outputArray
  };
};
