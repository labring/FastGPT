/* Abandoned */
import type { ChatItemMiniType } from '@fastgpt/global/core/chat/type';
import { type SelectAppItemType } from '@fastgpt/global/core/workflow/template/system/abandoned/runApp/type';
import type { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { chatValue2RuntimePrompt } from '@fastgpt/global/core/chat/adapt';
import type { DispatchNodeResultType, ModuleDispatchProps } from '../../types/runtime';
import { runChildAppWorkflow } from '../child/runApp';

type Props = ModuleDispatchProps<{
  [NodeInputKeyEnum.userChatInput]: string;
  [NodeInputKeyEnum.history]?: ChatItemMiniType[] | number;
  app: SelectAppItemType;
}>;
type Response = DispatchNodeResultType<{
  [NodeOutputKeyEnum.answerText]: string;
  [NodeOutputKeyEnum.history]: ChatItemMiniType[];
}>;

export const dispatchAppRequest = async (props: Props): Promise<Response> => {
  const {
    query,
    variableState,
    params: { userChatInput, history, app }
  } = props;

  if (!userChatInput) {
    return Promise.reject('Input is empty');
  }

  const { appData, assistantResponses, system_memories, completeMessages, text } =
    await runChildAppWorkflow({
      ...props,
      // 旧节点只支持独立调用，不接管父流程或其他节点的交互恢复状态。
      lastInteractive: undefined,
      appId: app.id,
      resourceType: 'agent',
      userChatInput,
      history,
      userInputFiles: chatValue2RuntimePrompt(query).files,
      rawVariables: variableState.toStoreRecord()
    });

  return {
    data: {
      answerText: text,
      history: completeMessages
    },
    [DispatchNodeResponseKeyEnum.answerText]: text,
    assistantResponses,
    system_memories,
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      moduleLogo: appData.avatar,
      query: userChatInput,
      textOutput: text
    }
  };
};
