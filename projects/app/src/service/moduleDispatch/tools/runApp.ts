import { ChatHistoryItemResType, ChatItemType } from '@/types/chat';
import type { ModuleDispatchProps } from '@/types/core/chat/type';
import { SelectAppItemType } from '@/types/core/app/flow';
import { dispatchModules } from '@/pages/api/v1/chat/completions';
import { App } from '@/service/mongo';
import { responseWrite } from '@/service/common/stream';
import { ChatRoleEnum, TaskResponseKeyEnum, sseResponseEventEnum } from '@/constants/chat';
import { textAdaptGptResponse } from '@/utils/adapt';

type Props = ModuleDispatchProps<{
  userChatInput: string;
  history?: ChatItemType[];
  app: SelectAppItemType;
}>;
type Response = {
  finish: boolean;
  [TaskResponseKeyEnum.responseData]: ChatHistoryItemResType[];
  [TaskResponseKeyEnum.answerText]: string;
  [TaskResponseKeyEnum.history]: ChatItemType[];
};

export const dispatchAppRequest = async (props: Record<string, any>): Promise<Response> => {
  const {
    res,
    variables,
    user,
    stream,
    detail,
    inputs: { userChatInput, history = [], app }
  } = props as Props;

  if (!userChatInput) {
    return Promise.reject('Input is empty');
  }

  const appData = await App.findById(app.id);

  if (!appData) {
    return Promise.reject('App not found');
  }

  responseWrite({
    res,
    event: detail ? sseResponseEventEnum.answer : undefined,
    data: textAdaptGptResponse({
      text: '\n'
    })
  });

  const { responseData, answerText } = await dispatchModules({
    res,
    modules: appData.modules,
    user,
    variables,
    params: {
      history,
      userChatInput
    },
    stream,
    detail
  });

  const completeMessages = history.concat([
    {
      obj: ChatRoleEnum.Human,
      value: userChatInput
    },
    {
      obj: ChatRoleEnum.AI,
      value: answerText
    }
  ]);

  return {
    finish: true,
    responseData,
    [TaskResponseKeyEnum.answerText]: answerText,
    [TaskResponseKeyEnum.history]: completeMessages
  };
};
