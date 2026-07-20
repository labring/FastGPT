import type { ChatItemMiniType } from '@fastgpt/global/core/chat/type';

import type { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import {
  getLLMModel,
  assertModelUsable,
  getDefaultEmbeddingModel
} from '../../../../core/ai/model/cache';
import { formatModelChars2Points } from '../../../../support/wallet/usage/utils';
import { queryExtension } from '../../../../core/ai/functions/queryExtension';
import { getHistories } from '../utils';
import { hashStr } from '@fastgpt/global/common/string/tools';
import type { DispatchNodeResultType, ModuleDispatchProps } from '../../types/runtime';

type Props = ModuleDispatchProps<{
  [NodeInputKeyEnum.aiModelId]: string;
  [NodeInputKeyEnum.aiSystemPrompt]?: string;
  [NodeInputKeyEnum.history]?: ChatItemMiniType[] | number;
  [NodeInputKeyEnum.userChatInput]: string;
}>;
type Response = DispatchNodeResultType<{
  [NodeOutputKeyEnum.text]: string;
}>;

export const dispatchQueryExtension = async ({
  histories,
  node,
  usagePush,
  runningUserInfo,
  params: { modelId, systemPrompt, history, userChatInput }
}: Props): Promise<Response> => {
  if (!userChatInput) {
    return Promise.reject('Question is empty');
  }

  // Existence + active in one guard (F2-S3-TC06).
  const queryExtensionModel = assertModelUsable(getLLMModel(modelId));
  const embeddingModel = getDefaultEmbeddingModel();
  if (!embeddingModel) {
    return Promise.reject('Default embedding model not found');
  }
  const chatHistories = getHistories(history, histories);

  const { extensionQueries, inputTokens, outputTokens, embeddingTokens } = await queryExtension({
    chatBg: systemPrompt,
    query: userChatInput,
    histories: chatHistories,
    llmModelId: queryExtensionModel.id,
    embeddingModelId: embeddingModel.id,
    teamId: runningUserInfo.teamId
  });

  extensionQueries.unshift(userChatInput);

  const { totalPoints: llmPoints, modelName: llmModelName } = formatModelChars2Points({
    modelData: queryExtensionModel,
    inputTokens,
    outputTokens
  });

  const { totalPoints: embeddingPoints, modelName: embeddingModelName } = formatModelChars2Points({
    modelData: embeddingModel,
    inputTokens: embeddingTokens
  });

  const totalPoints = llmPoints + embeddingPoints;
  usagePush([
    {
      moduleName: node.name,
      totalPoints: llmPoints,
      modelId: queryExtensionModel.id,
      model: llmModelName,
      inputTokens,
      outputTokens
    },
    {
      moduleName: `${node.name} - Embedding`,
      totalPoints: embeddingPoints,
      modelId: embeddingModel.id,
      model: embeddingModelName,
      inputTokens: embeddingTokens,
      outputTokens: 0
    }
  ]);

  const set = new Set<string>();
  const filterSameQueries = extensionQueries.filter((item) => {
    // 删除所有的标点符号与空格等，只对文本进行比较
    const str = hashStr(item.replace(/[^\p{L}\p{N}]/gu, ''));
    if (set.has(str)) return false;
    set.add(str);
    return true;
  });

  return {
    data: {
      [NodeOutputKeyEnum.text]: JSON.stringify(filterSameQueries)
    },
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      totalPoints,
      modelId: queryExtensionModel.id,
      model: llmModelName,
      inputTokens,
      outputTokens,
      embeddingTokens,
      query: userChatInput,
      textOutput: JSON.stringify(filterSameQueries)
    }
  };
};
