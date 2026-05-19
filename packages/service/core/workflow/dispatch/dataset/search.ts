import { type DispatchNodeResultType } from '@fastgpt/global/core/workflow/runtime/type';
import { formatModelChars2Points } from '../../../../support/wallet/usage/utils';
import type { SelectedDatasetType } from '@fastgpt/global/core/workflow/type/io';
import type { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import type { ModuleDispatchProps } from '@fastgpt/global/core/workflow/runtime/type';
import { getEmbeddingModel, getRerankModel } from '../../../ai/model';
import { deepRagSearch, defaultSearchDatasetData } from '../../../dataset/search';
import type { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constants';
import { type ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import { MongoDataset } from '../../../dataset/schema';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import { filterDatasetsByTmbId } from '../../../dataset/utils';
import { getDatasetSearchToolResponsePrompt } from '@fastgpt/global/core/ai/prompt/dataset.const';
import { getNodeErrResponse } from '../utils';
import { getLogger, LogCategories } from '../../../../common/logger';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import {
  createImageCaptionChildNodeResponse,
  createQueryExtensionChildNodeResponse
} from './nodeResponse';
import { normalizeDatasetSearchInput } from './utils';

const logger = getLogger(LogCategories.MODULE.WORKFLOW.DATASET);

type DatasetSearchProps = ModuleDispatchProps<{
  [NodeInputKeyEnum.datasetSelectList]: SelectedDatasetType[];
  [NodeInputKeyEnum.datasetSimilarity]: number;
  [NodeInputKeyEnum.datasetMaxTokens]: number;
  [NodeInputKeyEnum.userChatInput]?: string;
  [NodeInputKeyEnum.datasetSearchInput]?: string[];
  [NodeInputKeyEnum.datasetSearchMode]: DatasetSearchModeEnum;
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
    externalProvider,
    histories,
    node,
    params: {
      datasets = [],
      similarity,
      limit = 5000,
      userChatInput = '',
      datasetSearchInput = [],
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
    return getNodeErrResponse({ error: i18nT('common:core.chat.error.Select dataset empty') });
  }

  const emptyResult: DatasetSearchResponse = {
    data: {
      quoteQA: []
    },
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      totalPoints: 0,
      query: '',
      limit,
      searchMode
    },
    [DispatchNodeResponseKeyEnum.toolResponses]: []
  };

  const searchQueries = userChatInput ? [userChatInput] : datasetSearchInput;

  const { textQueries, imageQueries } = normalizeDatasetSearchInput(searchQueries);
  if (textQueries.length === 0 && imageQueries.length === 0) {
    return emptyResult;
  }

  try {
    const datasetIds = authTmbId
      ? await filterDatasetsByTmbId({
          datasetIds: datasets.map((item) => item.datasetId),
          tmbId
        })
      : await Promise.resolve(datasets.map((item) => item.datasetId));

    if (datasetIds.length === 0) {
      return emptyResult;
    }

    // Get vector model
    const dataset = await MongoDataset.findById(
      datasets[0].datasetId,
      'vectorModel vlmModel'
    ).lean();
    const vectorModel = getEmbeddingModel(dataset?.vectorModel);
    // Get Rerank Model
    const rerankModelData = getRerankModel(rerankModel);

    // start search
    const searchData = {
      histories,
      teamId,
      textQueries,
      imageQueries,
      model: vectorModel.model,
      vlmModel: dataset?.vlmModel,
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
    const useDeepSearch = datasetDeepSearch && textQueries.length > 0;
    const {
      searchRes,
      embeddingTokens,
      reRankInputTokens,
      usingSimilarityFilter,
      usingReRank: searchUsingReRank,
      queryExtensionResult,
      imageCaptionResult,
      deepSearchResult
    } = useDeepSearch
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
          datasetSearchExtensionBg,
          userKey: externalProvider.openaiAccount
        });

    // count bill results
    const nodeUsages: ChatNodeUsageType[] = [];
    const childrenResponses: ChatHistoryItemResType[] = [];
    {
      // 1. Search vector
      const { totalPoints: embeddingTotalPoints, modelName: embeddingModelName } =
        formatModelChars2Points({
          model: vectorModel.model,
          inputTokens: embeddingTokens
        });
      nodeUsages.push({
        totalPoints: embeddingTotalPoints,
        moduleName: node.name,
        model: embeddingModelName,
        inputTokens: embeddingTokens
      });
      // 2. Rerank
      if (searchUsingReRank) {
        const { totalPoints: reRankTotalPoints, modelName: reRankModelName } =
          formatModelChars2Points({
            model: rerankModelData?.model,
            inputTokens: reRankInputTokens
          });
        nodeUsages.push({
          totalPoints: reRankTotalPoints,
          moduleName: i18nT('account_usage:rerank'),
          model: reRankModelName,
          inputTokens: reRankInputTokens
        });
      }
      // 3. Query extension
      if (queryExtensionResult) {
        const { totalPoints, modelName: llmModelName } = formatModelChars2Points({
          model: queryExtensionResult.llmModel,
          inputTokens: queryExtensionResult.inputTokens,
          outputTokens: queryExtensionResult.outputTokens
        });
        const llmPoints = queryExtensionResult.usedUserOpenAIKey ? 0 : totalPoints;
        const queryExtensionUsage: ChatNodeUsageType = {
          totalPoints: llmPoints,
          moduleName: i18nT('common:core.module.template.Query extension'),
          model: llmModelName,
          inputTokens: queryExtensionResult.inputTokens,
          outputTokens: queryExtensionResult.outputTokens
        };
        nodeUsages.push(queryExtensionUsage);
        childrenResponses.push(
          createQueryExtensionChildNodeResponse({
            requestIds: [queryExtensionResult.requestId],
            usage: queryExtensionUsage,
            seconds: queryExtensionResult.seconds,
            query: queryExtensionResult.query
          })
        );

        const { totalPoints: embeddingPoints, modelName: embeddingModelName } =
          formatModelChars2Points({
            model: queryExtensionResult.embeddingModel,
            inputTokens: queryExtensionResult.embeddingTokens
          });
        nodeUsages.push({
          totalPoints: embeddingPoints,
          moduleName: `${i18nT('account_usage:ai.query_extension_embedding')}`,
          model: embeddingModelName,
          inputTokens: queryExtensionResult.embeddingTokens,
          outputTokens: 0
        });
      }
      // 4. Image caption
      if (imageCaptionResult) {
        const { totalPoints, modelName } = formatModelChars2Points({
          model: imageCaptionResult.model,
          inputTokens: imageCaptionResult.inputTokens,
          outputTokens: imageCaptionResult.outputTokens
        });
        const imageCaptionPoints = imageCaptionResult.usedUserOpenAIKey ? 0 : totalPoints;
        const imageCaptionUsage: ChatNodeUsageType = {
          totalPoints: imageCaptionPoints,
          moduleName: i18nT('account_usage:image_parse'),
          model: modelName,
          inputTokens: imageCaptionResult.inputTokens,
          outputTokens: imageCaptionResult.outputTokens
        };
        nodeUsages.push(imageCaptionUsage);
        childrenResponses.push(
          createImageCaptionChildNodeResponse({
            requestIds: imageCaptionResult.requestIds,
            usage: imageCaptionUsage,
            seconds: imageCaptionResult.seconds,
            queries: imageCaptionResult.queries
          })
        );
      }
      // 5. Deep search
      if (deepSearchResult) {
        const { totalPoints, modelName } = formatModelChars2Points({
          model: deepSearchResult.model,
          inputTokens: deepSearchResult.inputTokens,
          outputTokens: deepSearchResult.outputTokens
        });
        nodeUsages.push({
          totalPoints,
          moduleName: i18nT('common:deep_rag_search'),
          model: modelName,
          inputTokens: deepSearchResult.inputTokens,
          outputTokens: deepSearchResult.outputTokens
        });
      }
    }
    const totalPoints = nodeUsages.reduce((acc, item) => acc + item.totalPoints, 0);
    const childTotalPoints = childrenResponses.reduce(
      (sum, item) => sum + (item.totalPoints || 0),
      0
    );
    props.usagePush(nodeUsages);

    return {
      data: {
        quoteQA: searchRes
      },
      [DispatchNodeResponseKeyEnum.nodeResponse]: {
        totalPoints,
        datasetQueries: [...textQueries, ...imageQueries],
        embeddingModel: vectorModel.name,
        embeddingTokens,
        similarity: usingSimilarityFilter ? similarity : undefined,
        limit,
        searchMode,
        embeddingWeight:
          searchMode === DatasetSearchModeEnum.mixedRecall ? embeddingWeight : undefined,
        // Rerank
        ...(searchUsingReRank && {
          rerankModel: rerankModelData?.name,
          rerankWeight: rerankWeight,
          reRankInputTokens
        }),
        searchUsingReRank,
        deepSearchResult,
        ...(childrenResponses.length > 0 ? { childrenResponses } : {}),
        ...(childTotalPoints > 0 ? { childTotalPoints } : {}),
        // Results
        quoteList: searchRes
      },
      [DispatchNodeResponseKeyEnum.toolResponses]:
        searchRes.length > 0
          ? {
              prompt: getDatasetSearchToolResponsePrompt(),
              cites: searchRes.map((item) => ({
                id: item.id,
                sourceName: item.sourceName,
                updateTime: item.updateTime,
                content: `${item.q}\n${item.a}`.trim()
              }))
            }
          : 'No results'
    };
  } catch (error) {
    logger.error('Dataset search dispatch failed', { error });
    return getNodeErrResponse({ error });
  }
}
