import type { moduleDispatchResType } from '@fastgpt/global/core/chat/type.d';
import { formatModelPrice2Store } from '@/service/support/wallet/bill/utils';
import type { SelectedDatasetType } from '@fastgpt/global/core/module/api.d';
import type { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import type { ModuleDispatchProps } from '@fastgpt/global/core/module/type.d';
import { ModelTypeEnum, getLLMModel, getVectorModel } from '@/service/core/ai/model';
import { searchDatasetData } from '@/service/core/dataset/data/controller';
import { ModuleInputKeyEnum, ModuleOutputKeyEnum } from '@fastgpt/global/core/module/constants';
import { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constants';
import { queryExtension } from '@fastgpt/service/core/ai/functions/queryExtension';
import { getHistories } from '../utils';
import { datasetSearchQueryExtension } from '@fastgpt/service/core/dataset/search/utils';

type DatasetSearchProps = ModuleDispatchProps<{
  [ModuleInputKeyEnum.datasetSelectList]: SelectedDatasetType;
  [ModuleInputKeyEnum.datasetSimilarity]: number;
  [ModuleInputKeyEnum.datasetMaxTokens]: number;
  [ModuleInputKeyEnum.datasetSearchMode]: `${DatasetSearchModeEnum}`;
  [ModuleInputKeyEnum.userChatInput]: string;
  [ModuleInputKeyEnum.datasetSearchUsingReRank]: boolean;
  [ModuleInputKeyEnum.datasetSearchUsingExtensionQuery]: boolean;
  [ModuleInputKeyEnum.datasetSearchExtensionModel]: string;
  [ModuleInputKeyEnum.datasetSearchExtensionBg]: string;
}>;
export type DatasetSearchResponse = {
  [ModuleOutputKeyEnum.responseData]: moduleDispatchResType;
  [ModuleOutputKeyEnum.datasetIsEmpty]?: boolean;
  [ModuleOutputKeyEnum.datasetUnEmpty]?: boolean;
  [ModuleOutputKeyEnum.datasetQuoteQA]: SearchDataResponseItemType[];
};

export async function dispatchDatasetSearch(
  props: DatasetSearchProps
): Promise<DatasetSearchResponse> {
  const {
    teamId,
    histories,
    params: {
      datasets = [],
      similarity,
      limit = 1500,
      usingReRank,
      searchMode,
      userChatInput,

      datasetSearchUsingExtensionQuery,
      datasetSearchExtensionModel,
      datasetSearchExtensionBg
    }
  } = props as DatasetSearchProps;

  if (!Array.isArray(datasets)) {
    return Promise.reject('Quote type error');
  }

  if (datasets.length === 0) {
    return Promise.reject('core.chat.error.Select dataset empty');
  }

  if (!userChatInput) {
    return Promise.reject('core.chat.error.User input empty');
  }

  // query extension
  const extensionModel =
    datasetSearchUsingExtensionQuery && datasetSearchExtensionModel
      ? getLLMModel(datasetSearchExtensionModel)
      : undefined;
  const { concatQueries, rewriteQuery, aiExtensionResult } = await datasetSearchQueryExtension({
    query: userChatInput,
    extensionModel,
    extensionBg: datasetSearchExtensionBg,
    histories: getHistories(6, histories)
  });

  // get vector
  const vectorModel = getVectorModel(datasets[0]?.vectorModel?.model);

  // start search
  const {
    searchRes,
    charsLength,
    usingSimilarityFilter,
    usingReRank: searchUsingReRank
  } = await searchDatasetData({
    teamId,
    reRankQuery: `${rewriteQuery}`,
    queries: concatQueries,
    model: vectorModel.model,
    similarity,
    limit,
    datasetIds: datasets.map((item) => item.datasetId),
    searchMode,
    usingReRank
  });

  // count bill results
  // vector
  const { total, modelName } = formatModelPrice2Store({
    model: vectorModel.model,
    inputLen: charsLength,
    type: ModelTypeEnum.vector
  });
  const responseData: moduleDispatchResType & { price: number } = {
    price: total,
    query: concatQueries.join('\n'),
    model: modelName,
    charsLength,
    similarity: usingSimilarityFilter ? similarity : undefined,
    limit,
    searchMode,
    searchUsingReRank: searchUsingReRank
  };

  if (aiExtensionResult) {
    const { total, modelName } = formatModelPrice2Store({
      model: aiExtensionResult.model,
      inputLen: aiExtensionResult.inputTokens,
      outputLen: aiExtensionResult.outputTokens,
      type: ModelTypeEnum.llm
    });

    responseData.price += total;
    responseData.inputTokens = aiExtensionResult.inputTokens;
    responseData.outputTokens = aiExtensionResult.outputTokens;
    responseData.extensionModel = modelName;
    responseData.extensionResult =
      aiExtensionResult.extensionQueries?.join('\n') ||
      JSON.stringify(aiExtensionResult.extensionQueries);
  }

  return {
    isEmpty: searchRes.length === 0 ? true : undefined,
    unEmpty: searchRes.length > 0 ? true : undefined,
    quoteQA: searchRes,
    responseData
  };
}
