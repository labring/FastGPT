import type { moduleDispatchResType } from '@fastgpt/global/core/chat/type.d';
import { TaskResponseKeyEnum } from '@fastgpt/global/core/chat/constants';
import { countModelPrice } from '@/service/support/wallet/bill/utils';
import type { SelectedDatasetType } from '@fastgpt/global/core/module/api.d';
import type { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import type { ModuleDispatchProps } from '@/types/core/chat/type';
import { ModelTypeEnum } from '@/service/core/ai/model';
import { searchDatasetData } from '@/service/core/dataset/data/pg';

type DatasetSearchProps = ModuleDispatchProps<{
  datasets: SelectedDatasetType;
  similarity: number;
  limit: number;
  userChatInput: string;
}>;
export type KBSearchResponse = {
  [TaskResponseKeyEnum.responseData]: moduleDispatchResType;
  isEmpty?: boolean;
  unEmpty?: boolean;
  quoteQA: SearchDataResponseItemType[];
};

export async function dispatchDatasetSearch(props: Record<string, any>): Promise<KBSearchResponse> {
  const {
    inputs: { datasets = [], similarity = 0.4, limit = 5, userChatInput }
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
    datasetIds: datasets.map((item) => item.datasetId)
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
      model: vectorModel.name,
      tokens: tokenLen,
      similarity,
      limit
    }
  };
}
