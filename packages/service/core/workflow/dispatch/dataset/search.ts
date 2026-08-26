import { formatModelChars2Points } from '../../../../support/wallet/usage/utils';
import type { SelectedDatasetType } from '@fastgpt/global/core/workflow/type/io';
import type { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import type { DispatchNodeResultType, ModuleDispatchProps } from '../../types/runtime';
import {
  getEmbeddingModelData,
  getLLMModelData,
  getRerankModelData,
  getVlmModelData
} from '../../../ai/model';
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
  [NodeInputKeyEnum.datasetSearchRerankModelId]?: string;
  [NodeInputKeyEnum.datasetSearchRerankModel]?: string;
  [NodeInputKeyEnum.datasetSearchRerankWeight]?: number;

  [NodeInputKeyEnum.collectionFilterMatch]: string;
  [NodeInputKeyEnum.authTmbId]?: boolean;

  [NodeInputKeyEnum.datasetSearchUsingExtensionQuery]: boolean;
  [NodeInputKeyEnum.datasetSearchExtensionModelId]?: string;
  [NodeInputKeyEnum.datasetSearchExtensionModel]?: string;
  [NodeInputKeyEnum.datasetSearchExtensionBg]: string;

  [NodeInputKeyEnum.datasetDeepSearch]?: boolean;
  [NodeInputKeyEnum.datasetDeepSearchModelId]?: string;
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
      rerankModelId,
      rerankModel,
      rerankWeight,

      datasetSearchUsingExtensionQuery,
      datasetSearchExtensionModelId,
      datasetSearchExtensionModel,
      datasetSearchExtensionBg,

      datasetDeepSearch,
      datasetDeepSearchModelId,
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
    [DispatchNodeResponseKeyEnum.toolResponse]: []
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
      'vectorModelId vectorModel vlmModelId vlmModel'
    ).lean();
    const vectorModel = getEmbeddingModelData({
      modelId: dataset?.vectorModelId,
      model: dataset?.vectorModel
    });
    const vlmModel =
      dataset?.vlmModelId || dataset?.vlmModel
        ? getVlmModelData({ modelId: dataset?.vlmModelId, model: dataset?.vlmModel })
        : undefined;
    // Get Rerank Model
    const rerankModelData = usingReRank
      ? getRerankModelData({ modelId: rerankModelId, model: rerankModel })
      : undefined;
    const extensionModelData = datasetSearchUsingExtensionQuery
      ? getLLMModelData({
          modelId: datasetSearchExtensionModelId,
          model: datasetSearchExtensionModel
        })
      : undefined;
    const deepSearchModelData = datasetDeepSearch
      ? getLLMModelData({ modelId: datasetDeepSearchModelId, model: datasetDeepSearchModel })
      : undefined;

    // start search
    const searchData = {
      histories,
      teamId,
      textQueries,
      imageQueries,
      model: vectorModel,
      vlmModel,
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
          datasetDeepSearchModel: deepSearchModelData,
          datasetDeepSearchMaxTimes,
          datasetDeepSearchBg
        })
      : await defaultSearchDatasetData({
          ...searchData,
          datasetSearchUsingExtensionQuery,
          datasetSearchExtensionModel: extensionModelData,
          datasetSearchExtensionBg,
          userKey: externalProvider.openaiAccount
        });

    // count bill results
    const nodeUsages: ChatNodeUsageType[] = [];
    const childrenResponses: ChatHistoryItemResType[] = [];
    {
      // 1. Search vector
      const { totalPoints: embeddingTotalPoints } = formatModelChars2Points({
        model: vectorModel,
        inputTokens: embeddingTokens
      });
      nodeUsages.push({
        totalPoints: embeddingTotalPoints,
        moduleName: node.name,
        modelId: vectorModel.modelId,
        inputTokens: embeddingTokens
      });
      // 2. Rerank
      if (searchUsingReRank) {
        const { totalPoints: reRankTotalPoints } = formatModelChars2Points({
          model: rerankModelData!,
          inputTokens: reRankInputTokens
        });
        nodeUsages.push({
          totalPoints: reRankTotalPoints,
          moduleName: i18nT('account_usage:rerank'),
          modelId: rerankModelData!.modelId,
          inputTokens: reRankInputTokens
        });
      }
      // 3. Query extension
      if (queryExtensionResult) {
        const { totalPoints } = formatModelChars2Points({
          model: extensionModelData!,
          inputTokens: queryExtensionResult.inputTokens,
          outputTokens: queryExtensionResult.outputTokens
        });
        const llmPoints = queryExtensionResult.usedUserOpenAIKey ? 0 : totalPoints;
        const queryExtensionUsage: ChatNodeUsageType = {
          totalPoints: llmPoints,
          moduleName: i18nT('common:core.module.template.Query extension'),
          modelId: extensionModelData?.modelId,
          inputTokens: queryExtensionResult.inputTokens,
          outputTokens: queryExtensionResult.outputTokens
        };
        nodeUsages.push(queryExtensionUsage);
        childrenResponses.push(
          createQueryExtensionChildNodeResponse({
            requestIds: [queryExtensionResult.requestId],
            usage: queryExtensionUsage,
            modelName: extensionModelData!.name,
            seconds: queryExtensionResult.seconds,
            query: queryExtensionResult.query
          })
        );

        const { totalPoints: embeddingPoints } = formatModelChars2Points({
          model: vectorModel,
          inputTokens: queryExtensionResult.embeddingTokens
        });
        nodeUsages.push({
          totalPoints: embeddingPoints,
          moduleName: `${i18nT('account_usage:ai.query_extension_embedding')}`,
          modelId: vectorModel.modelId,
          inputTokens: queryExtensionResult.embeddingTokens,
          outputTokens: 0
        });
      }
      // 4. Image caption
      if (imageCaptionResult) {
        const { totalPoints } = formatModelChars2Points({
          model: vlmModel!,
          inputTokens: imageCaptionResult.inputTokens,
          outputTokens: imageCaptionResult.outputTokens
        });
        const imageCaptionPoints = imageCaptionResult.usedUserOpenAIKey ? 0 : totalPoints;
        const imageCaptionUsage: ChatNodeUsageType = {
          totalPoints: imageCaptionPoints,
          moduleName: i18nT('account_usage:image_parse'),
          modelId: vlmModel?.modelId,
          inputTokens: imageCaptionResult.inputTokens,
          outputTokens: imageCaptionResult.outputTokens
        };
        nodeUsages.push(imageCaptionUsage);
        childrenResponses.push(
          createImageCaptionChildNodeResponse({
            requestIds: imageCaptionResult.requestIds,
            usage: imageCaptionUsage,
            modelName: vlmModel!.name,
            seconds: imageCaptionResult.seconds,
            queries: imageCaptionResult.queries
          })
        );
      }
      // 5. Deep search
      if (deepSearchResult) {
        const { totalPoints } = formatModelChars2Points({
          model: deepSearchModelData!,
          inputTokens: deepSearchResult.inputTokens,
          outputTokens: deepSearchResult.outputTokens
        });
        nodeUsages.push({
          totalPoints,
          moduleName: i18nT('common:deep_rag_search'),
          modelId: deepSearchModelData?.modelId,
          inputTokens: deepSearchResult.inputTokens,
          outputTokens: deepSearchResult.outputTokens
        });
      }
    }
    const totalPoints = nodeUsages.reduce((acc, item) => acc + item.totalPoints, 0);
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
        // Results
        quoteList: searchRes
      },
      [DispatchNodeResponseKeyEnum.toolResponse]:
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
