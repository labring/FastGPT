import {
  type DispatchNodeResponseType,
  type DispatchNodeResultType
} from '@fastgpt/global/core/workflow/runtime/type.d';
import { formatModelChars2Points } from '../../../../support/wallet/usage/utils';
import type { SelectedDatasetType } from '@fastgpt/global/core/workflow/api.d';
import type { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import type { ModuleDispatchProps } from '@fastgpt/global/core/workflow/runtime/type';
import { getEmbeddingModel, getRerankModel } from '../../../ai/model';
import { deepRagSearch, defaultSearchDatasetData } from '../../../dataset/search/controller';
import type { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constants';
import { type ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import { MongoDataset } from '../../../dataset/schema';
import { i18nT } from '../../../../../web/i18n/utils';
import { filterDatasetsByTmbId } from '../../../dataset/utils';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/model';
import { getDatasetSearchToolResponsePrompt } from '../../../../../global/core/ai/prompt/dataset';

type DatasetSearchProps = ModuleDispatchProps<{
  [NodeInputKeyEnum.datasetSelectList]: SelectedDatasetType;
  [NodeInputKeyEnum.datasetSimilarity]: number;
  [NodeInputKeyEnum.datasetMaxTokens]: number;
  [NodeInputKeyEnum.userChatInput]?: string;
  [NodeInputKeyEnum.datasetSearchMode]: `${DatasetSearchModeEnum}`;
  [NodeInputKeyEnum.datasetSearchEmbeddingWeight]?: number;

  [NodeInputKeyEnum.datasetSearchUsingReRank]: boolean;
  [NodeInputKeyEnum.datasetSearchRerankModel]?: string;
  [NodeInputKeyEnum.datasetSearchRerankWeight]?: number;

  [NodeInputKeyEnum.collectionFilterMatch]: string;
  [NodeInputKeyEnum.authTmbId]?: boolean;

  [NodeInputKeyEnum.datasetSearchUsingExtensionQuery]: boolean;
  [NodeInputKeyEnum.datasetSearchExtensionModel]: string;
  [NodeInputKeyEnum.datasetSearchExtensionBg]: string;

  [NodeInputKeyEnum.datasetDeepSearch]?: boolean;
  [NodeInputKeyEnum.datasetDeepSearchModel]?: string;
  [NodeInputKeyEnum.datasetDeepSearchMaxTimes]?: number;
  [NodeInputKeyEnum.datasetDeepSearchBg]?: string;
}>;
export type DatasetSearchResponse = DispatchNodeResultType<{
  [NodeOutputKeyEnum.datasetQuoteQA]: SearchDataResponseItemType[];
}>;

export async function dispatchDatasetSearch(
  props: DatasetSearchProps
): Promise<DatasetSearchResponse> {
  const {
    runningAppInfo: { teamId },
    runningUserInfo: { tmbId },
    histories,
    node,
    params: {
      datasets = [],
      similarity,
      limit = 5000,
      userChatInput = '',
      authTmbId = false,
      collectionFilterMatch,
      searchMode,
      embeddingWeight,
      usingReRank,
      rerankModel,
      rerankWeight,

      datasetSearchUsingExtensionQuery,
      datasetSearchExtensionModel,
      datasetSearchExtensionBg,

      datasetDeepSearch,
      datasetDeepSearchModel,
      datasetDeepSearchMaxTimes,
      datasetDeepSearchBg
    }
  } = props as DatasetSearchProps;

  if (!Array.isArray(datasets)) {
    return Promise.reject(i18nT('chat:dataset_quote_type error'));
  }

  if (datasets.length === 0) {
    return Promise.reject(i18nT('common:core.chat.error.Select dataset empty'));
  }

  const emptyResult = {
    quoteQA: [],
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      totalPoints: 0,
      query: '',
      limit,
      searchMode
    },
    nodeDispatchUsages: [],
    [DispatchNodeResponseKeyEnum.toolResponses]: []
  };

  if (!userChatInput) {
    return emptyResult;
  }

  const datasetIds = authTmbId
    ? await filterDatasetsByTmbId({
        datasetIds: datasets.map((item) => item.datasetId),
        tmbId
      })
    : await Promise.resolve(datasets.map((item) => item.datasetId));

  if (datasetIds.length === 0) {
    return emptyResult;
  }

  // get vector
  const vectorModel = getEmbeddingModel(
    (await MongoDataset.findById(datasets[0].datasetId, 'vectorModel').lean())?.vectorModel
  );
  // Get Rerank Model
  const rerankModelData = getRerankModel(rerankModel);

  // start search
  const searchData = {
    histories,
    teamId,
    reRankQuery: userChatInput,
    queries: [userChatInput],
    model: vectorModel.model,
    similarity,
    limit,
    datasetIds,
    searchMode,
    embeddingWeight,
    usingReRank,
    rerankModel: rerankModelData,
    rerankWeight,
    collectionFilterMatch
  };
  const {
    searchRes,
    embeddingTokens,
    reRankInputTokens,
    usingSimilarityFilter,
    usingReRank: searchUsingReRank,
    queryExtensionResult,
    deepSearchResult
  } = datasetDeepSearch
    ? await deepRagSearch({
        ...searchData,
        datasetDeepSearchModel,
        datasetDeepSearchMaxTimes,
        datasetDeepSearchBg
      })
    : await defaultSearchDatasetData({
        ...searchData,
        datasetSearchUsingExtensionQuery,
        datasetSearchExtensionModel,
        datasetSearchExtensionBg
      });

  // count bill results
  const nodeDispatchUsages: ChatNodeUsageType[] = [];
  // vector
  const { totalPoints: embeddingTotalPoints, modelName: embeddingModelName } =
    formatModelChars2Points({
      model: vectorModel.model,
      inputTokens: embeddingTokens,
      modelType: ModelTypeEnum.embedding
    });
  nodeDispatchUsages.push({
    totalPoints: embeddingTotalPoints,
    moduleName: node.name,
    model: embeddingModelName,
    inputTokens: embeddingTokens
  });
  // Rerank
  const { totalPoints: reRankTotalPoints, modelName: reRankModelName } = formatModelChars2Points({
    model: rerankModelData?.model,
    inputTokens: reRankInputTokens,
    modelType: ModelTypeEnum.rerank
  });
  if (usingReRank) {
    nodeDispatchUsages.push({
      totalPoints: reRankTotalPoints,
      moduleName: node.name,
      model: reRankModelName,
      inputTokens: reRankInputTokens
    });
  }
  // Query extension
  (() => {
    if (queryExtensionResult) {
      const { totalPoints, modelName } = formatModelChars2Points({
        model: queryExtensionResult.model,
        inputTokens: queryExtensionResult.inputTokens,
        outputTokens: queryExtensionResult.outputTokens,
        modelType: ModelTypeEnum.llm
      });
      nodeDispatchUsages.push({
        totalPoints,
        moduleName: i18nT('common:core.module.template.Query extension'),
        model: modelName,
        inputTokens: queryExtensionResult.inputTokens,
        outputTokens: queryExtensionResult.outputTokens
      });
      return {
        totalPoints
      };
    }
    return {
      totalPoints: 0
    };
  })();
  // Deep search
  (() => {
    if (deepSearchResult) {
      const { totalPoints, modelName } = formatModelChars2Points({
        model: deepSearchResult.model,
        inputTokens: deepSearchResult.inputTokens,
        outputTokens: deepSearchResult.outputTokens,
        modelType: ModelTypeEnum.llm
      });
      nodeDispatchUsages.push({
        totalPoints,
        moduleName: i18nT('common:deep_rag_search'),
        model: modelName,
        inputTokens: deepSearchResult.inputTokens,
        outputTokens: deepSearchResult.outputTokens
      });
      return {
        totalPoints
      };
    }
    return {
      totalPoints: 0
    };
  })();

  const totalPoints = nodeDispatchUsages.reduce((acc, item) => acc + item.totalPoints, 0);

  const responseData: DispatchNodeResponseType & { totalPoints: number } = {
    totalPoints,
    query: userChatInput,
    embeddingModel: vectorModel.name,
    embeddingTokens,
    similarity: usingSimilarityFilter ? similarity : undefined,
    limit,
    searchMode,
    embeddingWeight: searchMode === DatasetSearchModeEnum.mixedRecall ? embeddingWeight : undefined,
    // Rerank
    ...(searchUsingReRank && {
      rerankModel: rerankModelData?.name,
      rerankWeight: rerankWeight,
      reRankInputTokens
    }),
    searchUsingReRank,
    // Results
    quoteList: searchRes,
    queryExtensionResult,
    deepSearchResult
  };

  return {
    quoteQA: searchRes,
    [DispatchNodeResponseKeyEnum.nodeResponse]: responseData,
    nodeDispatchUsages,
    [DispatchNodeResponseKeyEnum.toolResponses]: {
      prompt: getDatasetSearchToolResponsePrompt(),
      cites: searchRes.map((item) => ({
        id: item.id,
        sourceName: item.sourceName,
        updateTime: item.updateTime,
        content: `${item.q}\n${item.a}`.trim()
      }))
    }
  };
}
