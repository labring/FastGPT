import type { ChatItemType } from '@fastgpt/global/core/chat/type.d';
import type { ModuleDispatchProps } from '@fastgpt/global/core/module/type.d';
import { SelectAppItemType } from '@fastgpt/global/core/module/type';
import { dispatchWorkFlow } from '../index';
import { MongoApp } from '../../../../core/app/schema';
import { responseWrite } from '../../../../common/response';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { SseResponseEventEnum } from '@fastgpt/global/core/module/runtime/constants';
import { textAdaptGptResponse } from '@fastgpt/global/core/module/runtime/utils';
import { ModuleInputKeyEnum, ModuleOutputKeyEnum } from '@fastgpt/global/core/module/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/module/runtime/constants';
import { getHistories, setEntryEntries } from '../utils';
import { chatValue2RuntimePrompt, runtimePrompt2ChatsValue } from '@fastgpt/global/core/chat/adapt';
import { DispatchNodeResultType } from '@fastgpt/global/core/module/runtime/type';

type Props = ModuleDispatchProps<{
  [ModuleInputKeyEnum.userChatInput]: string;
  [ModuleInputKeyEnum.history]?: ChatItemType[] | number;
  app: SelectAppItemType;
}>;
type Response = DispatchNodeResultType<{
  [ModuleOutputKeyEnum.answerText]: string;
  [ModuleOutputKeyEnum.history]: ChatItemType[];
}>;

export const dispatchAppRequest = async (props: Props): Promise<Response> => {
  const {
    res,
    teamId,
    stream,
    detail,
    histories,
    inputFiles,
    params: { userChatInput, history, app }
  } = props;
  let start = Date.now();

  if (!userChatInput) {
    return Promise.reject('Input is empty');
  }

  const appData = await MongoApp.findOne({
    _id: app.id,
    teamId
  });

  if (!appData) {
    return Promise.reject('App not found');
  }

  if (stream) {
    responseWrite({
      res,
      event: detail ? SseResponseEventEnum.answer : undefined,
      data: textAdaptGptResponse({
        text: '\n'
      })
    });
  }

  const chatHistories = getHistories(history, histories);

  const { flowResponses, flowUsages, assistantResponses } = await dispatchWorkFlow({
    ...props,
    appId: app.id,
    modules: setEntryEntries(appData.modules),
    runtimeModules: undefined, // must reset
    histories: chatHistories,
    inputFiles,
    startParams: {
      userChatInput
    }
  });

  const completeMessages = chatHistories.concat([
    {
      obj: ChatRoleEnum.Human,
      value: runtimePrompt2ChatsValue({
        files: inputFiles,
        text: userChatInput
      })
    },
    {
      obj: ChatRoleEnum.AI,
      value: assistantResponses
    }
  ]);

  const { text } = chatValue2RuntimePrompt(assistantResponses);

  return {
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      moduleLogo: appData.avatar,
      query: userChatInput,
      textOutput: text,
      totalPoints: flowResponses.reduce((sum, item) => sum + (item.totalPoints || 0), 0)
    },
    [DispatchNodeResponseKeyEnum.nodeDispatchUsages]: [
      {
        moduleName: appData.name,
        totalPoints: flowUsages.reduce((sum, item) => sum + (item.totalPoints || 0), 0)
      }
    ],
    answerText: text,
    history: completeMessages
  };
};
