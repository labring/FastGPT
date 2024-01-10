import type { moduleDispatchResType } from '@fastgpt/global/core/chat/type.d';
import { formatModelPrice2Store } from '@/service/support/wallet/bill/utils';
import type { SelectedDatasetType } from '@fastgpt/global/core/module/api.d';
import type { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import type { ModuleDispatchProps } from '@fastgpt/global/core/module/type.d';
import { ModelTypeEnum } from '@/service/core/ai/model';
import { searchDatasetData } from '@/service/core/dataset/data/controller';
import { ModuleInputKeyEnum, ModuleOutputKeyEnum } from '@fastgpt/global/core/module/constants';
import { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constant';

type DatasetSearchProps = ModuleDispatchProps<{
  [ModuleInputKeyEnum.datasetSelectList]: SelectedDatasetType;
  [ModuleInputKeyEnum.datasetSimilarity]: number;
  [ModuleInputKeyEnum.datasetLimit]: number;
  [ModuleInputKeyEnum.datasetSearchMode]: `${DatasetSearchModeEnum}`;
  [ModuleInputKeyEnum.userChatInput]: string;
  [ModuleInputKeyEnum.datasetSearchUsingReRank]: boolean;
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
    inputs: { datasets = [], similarity, limit = 1500, usingReRank, searchMode, userChatInput }
  } = props as DatasetSearchProps;

  if (!Array.isArray(datasets)) {
    return Promise.reject('Quote type error');
  }

  if (datasets.length === 0) {
    return Promise.reject('core.chat.error.Select dataset empty');
  }

  if (!userChatInput) {
    return Promise.reject('core.chat.error.User question empty');
  }

  // get vector
  const vectorModel = datasets[0]?.vectorModel || global.vectorModels[0];

  // const { queries: extensionQueries } = await searchQueryExtension({
  //   query: userChatInput,
  //   model: global.chatModels[0].model
  // });
  const concatQueries = [userChatInput];

  // start search
  const {
    searchRes,
    tokens,
    usingSimilarityFilter,
    usingReRank: searchUsingReRank
  } = await searchDatasetData({
    rawQuery: `${userChatInput}`,
    queries: concatQueries,
    model: vectorModel.model,
    similarity,
    limit,
    datasetIds: datasets.map((item) => item.datasetId),
    searchMode,
    usingReRank
  });

  const { total, modelName } = formatModelPrice2Store({
    model: vectorModel.model,
    inputLen: tokens,
    type: ModelTypeEnum.vector
  });

  return {
    isEmpty: searchRes.length === 0 ? true : undefined,
    unEmpty: searchRes.length > 0 ? true : undefined,
    quoteQA: searchRes,
    responseData: {
      price: total,
      query: concatQueries.join('\n'),
      model: modelName,
      inputTokens: tokens,
      similarity: usingSimilarityFilter ? similarity : undefined,
      limit,
      searchMode,
      searchUsingReRank: searchUsingReRank
    }
  };
}
