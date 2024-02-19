import type { ChatItemType, moduleDispatchResType } from '@fastgpt/global/core/chat/type.d';
import type { ModuleDispatchProps } from '@fastgpt/global/core/module/type.d';
import { ModuleInputKeyEnum, ModuleOutputKeyEnum } from '@fastgpt/global/core/module/constants';
import { ModelTypeEnum, getLLMModel } from '@/service/core/ai/model';
import { formatModelChars2Points } from '@/service/support/wallet/usage/utils';
import { queryCfr } from '@fastgpt/service/core/ai/functions/cfr';
import { getHistories } from '../utils';

type Props = ModuleDispatchProps<{
  [ModuleInputKeyEnum.aiModel]: string;
  [ModuleInputKeyEnum.aiSystemPrompt]?: string;
  [ModuleInputKeyEnum.history]?: ChatItemType[] | number;
  [ModuleInputKeyEnum.userChatInput]: string;
}>;
type Response = {
  [ModuleOutputKeyEnum.text]: string;
  [ModuleOutputKeyEnum.responseData]?: moduleDispatchResType;
};

export const dispatchCFR = async ({
  histories,
  params: { model, systemPrompt, history, userChatInput }
}: Props): Promise<Response> => {
  if (!userChatInput) {
    return Promise.reject('Question is empty');
  }

  // none
  // first chat and no system prompt
  if (systemPrompt === 'none' || (histories.length === 0 && !systemPrompt)) {
    return {
      [ModuleOutputKeyEnum.text]: userChatInput
    };
  }

  const cfrModel = getLLMModel(model);
  const chatHistories = getHistories(history, histories);

  const { cfrQuery, charsLength } = await queryCfr({
    chatBg: systemPrompt,
    query: userChatInput,
    histories: chatHistories,
    model: cfrModel.model
  });

  const { totalPoints, modelName } = formatModelChars2Points({
    model: cfrModel.model,
    charsLength,
    modelType: ModelTypeEnum.llm
  });

  return {
    [ModuleOutputKeyEnum.responseData]: {
      totalPoints,
      model: modelName,
      charsLength,
      query: userChatInput,
      textOutput: cfrQuery
    },
    [ModuleOutputKeyEnum.text]: cfrQuery
  };
};
