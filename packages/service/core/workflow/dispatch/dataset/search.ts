import {
  DispatchNodeResponseType,
  DispatchNodeResultType
} from '@fastgpt/global/core/workflow/runtime/type.d';
import { formatModelChars2Points } from '../../../../support/wallet/usage/utils';
import type { SelectedDatasetType } from '@fastgpt/global/core/workflow/api.d';
import type { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import type { ModuleDispatchProps } from '@fastgpt/global/core/workflow/runtime/type';
import { getEmbeddingModel } from '../../../ai/model';
import { deepRagSearch, defaultSearchDatasetData } from '../../../dataset/search/controller';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constants';
import { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import { checkTeamReRankPermission } from '../../../../support/permission/teamLimit';
import { MongoDataset } from '../../../dataset/schema';
import { i18nT } from '../../../../../web/i18n/utils';
import { filterDatasetsByTmbId } from '../../../dataset/utils';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/model';

type DatasetSearchProps = ModuleDispatchProps<{
  [NodeInputKeyEnum.datasetSelectList]: SelectedDatasetType;
  [NodeInputKeyEnum.datasetSimilarity]: number;
  [NodeInputKeyEnum.datasetMaxTokens]: number;
  [NodeInputKeyEnum.datasetSearchMode]: `${DatasetSearchModeEnum}`;
  [NodeInputKeyEnum.userChatInput]?: string;
  [NodeInputKeyEnum.datasetSearchUsingReRank]: boolean;
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
      limit = 1500,
      usingReRank,
      searchMode,
      userChatInput = '',
      authTmbId = false,
      collectionFilterMatch,

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
  // console.log(concatQueries, rewriteQuery, aiExtensionResult);

  // get vector
  const vectorModel = getEmbeddingModel(
    (await MongoDataset.findById(datasets[0].datasetId, 'vectorModel').lean())?.vectorModel
  );

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
    usingReRank: usingReRank && (await checkTeamReRankPermission(teamId)),
    collectionFilterMatch
  };
  const {
    searchRes,
    tokens,
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
      inputTokens: tokens,
      modelType: ModelTypeEnum.embedding
    });
  nodeDispatchUsages.push({
    totalPoints: embeddingTotalPoints,
    moduleName: node.name,
    model: embeddingModelName,
    inputTokens: tokens
  });
  // Query extension
  const { totalPoints: queryExtensionTotalPoints } = (() => {
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
  const { totalPoints: deepSearchTotalPoints } = (() => {
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
  const totalPoints = embeddingTotalPoints + queryExtensionTotalPoints + deepSearchTotalPoints;

  const responseData: DispatchNodeResponseType & { totalPoints: number } = {
    totalPoints,
    query: userChatInput,
    model: vectorModel.model,
    inputTokens: tokens,
    similarity: usingSimilarityFilter ? similarity : undefined,
    limit,
    searchMode,
    searchUsingReRank: searchUsingReRank,
    quoteList: searchRes,
    queryExtensionResult,
    deepSearchResult
  };

  return {
    quoteQA: searchRes,
    [DispatchNodeResponseKeyEnum.nodeResponse]: responseData,
    nodeDispatchUsages,
    [DispatchNodeResponseKeyEnum.toolResponses]: searchRes.map((item) => ({
      sourceName: item.sourceName,
      updateTime: item.updateTime,
      content: `${item.q}\n${item.a}`.trim()
    }))
  };
}
