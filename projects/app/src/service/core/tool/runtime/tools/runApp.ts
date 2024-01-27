import type { moduleDispatchResType, ChatItemType } from '@fastgpt/global/core/chat/type.d';
import type { ModuleDispatchProps } from '@fastgpt/global/core/module/type.d';
import { SelectAppItemType } from '@fastgpt/global/core/module/type';
import { dispatchModules } from '../index';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { responseWrite } from '@fastgpt/service/common/response';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { sseResponseEventEnum } from '@fastgpt/service/common/response/constant';
import { textAdaptGptResponse } from '@/utils/adapt';
import { ModuleInputKeyEnum, ModuleOutputKeyEnum } from '@fastgpt/global/core/module/constants';
import { getHistories } from '../utils';

type Props = ModuleDispatchProps<{
  [ModuleInputKeyEnum.userChatInput]: string;
  [ModuleInputKeyEnum.history]?: ChatItemType[] | number;
  app: SelectAppItemType;
}>;
type Response = {
  [ModuleOutputKeyEnum.responseData]: moduleDispatchResType[];
  [ModuleOutputKeyEnum.answerText]: string;
  [ModuleOutputKeyEnum.history]: ChatItemType[];
};

export const dispatchAppRequest = async (props: Props): Promise<Response> => {
  const {
    res,
    user,
    stream,
    detail,
    histories,
    inputs: { userChatInput, history, app }
  } = props;

  if (!userChatInput) {
    return Promise.reject('Input is empty');
  }

  const appData = await MongoApp.findOne({
    _id: app.id,
    teamId: user.team.teamId
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

  const chatHistories = getHistories(history, histories);

  const { responseData, answerText } = await dispatchModules({
    ...props,
    appId: app.id,
    modules: appData.modules,
    histories: chatHistories,
    startParams: {
      userChatInput
    }
  });

  const completeMessages = chatHistories.concat([
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
    answerText: answerText,
    history: completeMessages
  };
};
