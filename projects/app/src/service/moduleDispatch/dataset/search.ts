import type { moduleDispatchResType } from '@fastgpt/global/core/chat/type.d';
import { countModelPrice } from '@/service/support/wallet/bill/utils';
import type { SelectedDatasetType } from '@fastgpt/global/core/module/api.d';
import type { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import type { ModuleDispatchProps } from '@/types/core/chat/type';
import { ModelTypeEnum } from '@/service/core/ai/model';
import { searchDatasetData } from '@/service/core/dataset/data/pg';
import { ModuleInputKeyEnum, ModuleOutputKeyEnum } from '@fastgpt/global/core/module/constants';

type DatasetSearchProps = ModuleDispatchProps<{
  [ModuleInputKeyEnum.datasetSelectList]: SelectedDatasetType;
  [ModuleInputKeyEnum.datasetSimilarity]: number;
  [ModuleInputKeyEnum.datasetLimit]: number;
  [ModuleInputKeyEnum.datasetStartReRank]: boolean;
  [ModuleInputKeyEnum.userChatInput]: string;
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
    tmbId,
    inputs: { datasets = [], similarity = 0.4, limit = 5, rerank, userChatInput }
  } = props as DatasetSearchProps;

  if (datasets.length === 0) {
    return Promise.reject("You didn't choose the knowledge base");
  }

  if (!userChatInput) {
    return Promise.reject('Your input is empty');
  }

  // get vector
  const vectorModel = datasets[0]?.vectorModel || global.vectorModels[0];

  const { searchRes, tokenLen } = await searchDatasetData({
    text: userChatInput,
    model: vectorModel.model,
    similarity,
    limit,
    datasetIds: datasets.map((item) => item.datasetId),
    rerank
  });

  return {
    isEmpty: searchRes.length === 0 ? true : undefined,
    unEmpty: searchRes.length > 0 ? true : undefined,
    quoteQA: searchRes,
    responseData: {
      price: countModelPrice({
        model: vectorModel.model,
        tokens: tokenLen,
        type: ModelTypeEnum.vector
      }),
      query: userChatInput,
      model: vectorModel.name,
      tokens: tokenLen,
      similarity,
      limit
    }
  };
}
