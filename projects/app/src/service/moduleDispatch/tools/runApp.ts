import type { moduleDispatchResType, ChatItemType } from '@fastgpt/global/core/chat/type.d';
import type {
  ModuleDispatchProps,
  ModuleDispatchResponse
} from '@fastgpt/global/core/module/type.d';
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
type Response = ModuleDispatchResponse<{
  [ModuleOutputKeyEnum.answerText]: string;
  [ModuleOutputKeyEnum.history]: ChatItemType[];
}>;

export const dispatchAppRequest = async (props: Props): Promise<Response> => {
  const {
    res,
    user,
    stream,
    detail,
    histories,
    params: { userChatInput, history, app }
  } = props;
  let start = Date.now();

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

  const { responseData, moduleDispatchBills, answerText } = await dispatchModules({
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
    [ModuleOutputKeyEnum.responseData]: {
      moduleLogo: appData.avatar,
      query: userChatInput,
      textOutput: answerText,
      totalPoints: responseData.reduce((sum, item) => sum + (item.totalPoints || 0), 0)
    },
    [ModuleOutputKeyEnum.moduleDispatchBills]: [
      {
        moduleName: appData.name,
        totalPoints: responseData.reduce((sum, item) => sum + (item.totalPoints || 0), 0),
        charsLength: 0,
        model: appData.name
      }
    ],
    answerText: answerText,
    history: completeMessages
  };
};
