/* Abandoned */

import type { ChatItemMiniType } from '@fastgpt/global/core/chat/type';

import type { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { getDefaultEmbeddingModelData, getLLMModelData } from '../../../../core/ai/model';
import { formatModelChars2Points } from '../../../../support/wallet/usage/utils';
import { queryExtension } from '../../../../core/ai/functions/queryExtension';
import { getHistories } from '../utils';
import { hashStr } from '@fastgpt/global/common/string/tools';
import type { DispatchNodeResultType, ModuleDispatchProps } from '../../types/runtime';

type Props = ModuleDispatchProps<{
  [NodeInputKeyEnum.aiModelId]?: string;
  /** @deprecated */
  [NodeInputKeyEnum.aiModel]?: string;
  [NodeInputKeyEnum.aiSystemPrompt]?: string;
  [NodeInputKeyEnum.history]?: ChatItemMiniType[] | number;
  [NodeInputKeyEnum.userChatInput]: string;
}>;
type Response = DispatchNodeResultType<{
  [NodeOutputKeyEnum.text]: string;
}>;

/** @deprecated 保留用于兼容已保存的问题优化节点。 */
export const dispatchQueryExtension = async ({
  histories,
  node,
  usagePush,
  runningUserInfo,
  params: { modelId, model, systemPrompt, history, userChatInput }
}: Props): Promise<Response> => {
  if (!userChatInput) {
    return Promise.reject('Question is empty');
  }

  const queryExtensionModel = getLLMModelData({ modelId, model });
  const embeddingModel = getDefaultEmbeddingModelData();
  const chatHistories = getHistories(history, histories);

  const { extensionQueries, inputTokens, outputTokens, embeddingTokens } = await queryExtension({
    chatBg: systemPrompt,
    query: userChatInput,
    histories: chatHistories,
    llmModel: queryExtensionModel,
    embeddingModel,
    teamId: runningUserInfo.teamId
  });

  extensionQueries.unshift(userChatInput);

  const { totalPoints: llmPoints, modelId: llmModelId } = formatModelChars2Points({
    model: queryExtensionModel,
    inputTokens,
    outputTokens
  });

  const { totalPoints: embeddingPoints, modelId: embeddingModelId } = formatModelChars2Points({
    model: embeddingModel,
    inputTokens: embeddingTokens
  });

  const totalPoints = llmPoints + embeddingPoints;
  usagePush([
    {
      moduleName: node.name,
      totalPoints: llmPoints,
      modelId: llmModelId,
      inputTokens,
      outputTokens
    },
    {
      moduleName: `${node.name} - Embedding`,
      totalPoints: embeddingPoints,
      modelId: embeddingModelId,
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
      model: queryExtensionModel.name,
      inputTokens,
      outputTokens,
      embeddingTokens,
      query: userChatInput,
      textOutput: JSON.stringify(filterSameQueries)
    }
  };
};
