import type { moduleDispatchResType, ChatItemType } from '@fastgpt/global/core/chat/type.d';
import type { ModuleDispatchProps } from '@/types/core/chat/type';
import { SelectAppItemType } from '@fastgpt/global/core/module/type';
import { dispatchModules } from '../index';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { responseWrite } from '@fastgpt/service/common/response';
import { ChatRoleEnum, TaskResponseKeyEnum } from '@fastgpt/global/core/chat/constants';
import { sseResponseEventEnum } from '@fastgpt/service/common/response/constant';
import { textAdaptGptResponse } from '@/utils/adapt';

type Props = ModuleDispatchProps<{
  userChatInput: string;
  history?: ChatItemType[];
  app: SelectAppItemType;
}>;
type Response = {
  [TaskResponseKeyEnum.responseData]: moduleDispatchResType[];
  [TaskResponseKeyEnum.answerText]: string;
  [TaskResponseKeyEnum.history]: ChatItemType[];
};

export const dispatchAppRequest = async (props: Props): Promise<Response> => {
  const {
    res,
    user,
    stream,
    detail,
    inputs: { userChatInput, history = [], app }
  } = props;

  if (!userChatInput) {
    return Promise.reject('Input is empty');
  }

  const appData = await MongoApp.findOne({
    _id: app.id,
    userId: user._id
  });

  if (!appData) {
    return Promise.reject('App not found');
  }

  if (stream) {
    responseWrite({
      res,
      event: detail ? sseResponseEventEnum.answer : undefined,
      data: textAdaptGptResponse({
        text: '\n'
      })
    });
  }

  const { responseData, answerText } = await dispatchModules({
    ...props,
    modules: appData.modules,
    params: {
      history,
      userChatInput
    }
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
    responseData,
    [TaskResponseKeyEnum.answerText]: answerText,
    [TaskResponseKeyEnum.history]: completeMessages
  };
};
