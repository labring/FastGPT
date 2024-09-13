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
  const {
    params,
    runtimeNodes,
    user,
    node: { name }
  } = props;
  const {
    loopInputArray,
    loopFlow: { childNodes }
  } = params;
  const runNodes = runtimeNodes.filter((node) => childNodes.includes(node.nodeId));
  const outputArray = [];
  const loopDetail: ChatHistoryItemResType[] = [];
  let totalPoints = 0;

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

    const loopOutputValue = response.flowResponses.find(
      (res) => res.moduleType === FlowNodeTypeEnum.loopEnd
    )?.loopOutputValue;

    outputArray.push(loopOutputValue);
    loopDetail.push(...response.flowResponses);

    totalPoints = response.flowUsages.reduce((acc, usage) => acc + usage.totalPoints, 0);
  }

  return {
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      totalPoints: totalPoints,
      loopInput: loopInputArray,
      loopResult: outputArray,
      loopDetail: loopDetail
    },
    [DispatchNodeResponseKeyEnum.nodeDispatchUsages]: [
      {
        totalPoints: user.openaiAccount?.key ? 0 : totalPoints,
        moduleName: name
      }
    ],
    [NodeOutputKeyEnum.loopArray]: outputArray
  };
};
