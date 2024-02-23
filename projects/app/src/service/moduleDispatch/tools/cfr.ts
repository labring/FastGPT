import type { ChatItemType, moduleDispatchResType } from '@fastgpt/global/core/chat/type.d';
import type { ModuleDispatchProps } from '@fastgpt/global/core/module/type.d';
import { ModuleInputKeyEnum, ModuleOutputKeyEnum } from '@fastgpt/global/core/module/constants';
import { ModelTypeEnum, getLLMModel } from '@/service/core/ai/model';
import { formatModelPrice2Store } from '@/service/support/wallet/bill/utils';
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

  const { cfrQuery, inputTokens, outputTokens } = await queryCfr({
    chatBg: systemPrompt,
    query: userChatInput,
    histories: chatHistories,
    model: cfrModel.model
  });

  const { total, modelName } = formatModelPrice2Store({
    model: cfrModel.model,
    inputLen: inputTokens,
    outputLen: outputTokens,
    type: ModelTypeEnum.llm
  });

  return {
    [ModuleOutputKeyEnum.responseData]: {
      price: total,
      model: modelName,
      inputTokens,
      outputTokens,
      query: userChatInput,
      textOutput: cfrQuery
    },
    [ModuleOutputKeyEnum.text]: cfrQuery
  };
};
