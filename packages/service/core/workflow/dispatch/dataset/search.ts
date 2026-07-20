import { formatModelChars2Points } from '../../../../support/wallet/usage/utils';
import type { SelectedDatasetType } from '@fastgpt/global/core/workflow/type/io';
import type { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import type { DispatchNodeResultType, ModuleDispatchProps } from '../../types/runtime';
import {
  getEmbeddingModel,
  getLLMModel,
  getRerankModel,
  getVlmModel,
  assertModelUsable,
  assertModelActive
} from '../../../ai/model/cache';
import { deepRagSearch, defaultSearchDatasetData } from '../../../dataset/search';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constants';
import { type ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import { MongoDataset } from '../../../dataset/schema';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import { filterDatasetsByTmbId, getDatasetModelIds } from '../../../dataset/utils';
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
  [NodeInputKeyEnum.datasetSearchRerankWeight]?: number;

  [NodeInputKeyEnum.collectionFilterMatch]: string;
  [NodeInputKeyEnum.authTmbId]?: boolean;

  [NodeInputKeyEnum.datasetSearchUsingExtensionQuery]: boolean;
  [NodeInputKeyEnum.datasetSearchExtensionModelId]: string;
  [NodeInputKeyEnum.datasetSearchExtensionBg]: string;

  [NodeInputKeyEnum.datasetDeepSearch]?: boolean;
  [NodeInputKeyEnum.datasetDeepSearchModelId]?: string;
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
      [NodeInputKeyEnum.datasetSearchRerankModelId]: rerankModelId,
      rerankWeight,

      datasetSearchUsingExtensionQuery,
      [NodeInputKeyEnum.datasetSearchExtensionModelId]: datasetSearchExtensionModelId,
      datasetSearchExtensionBg,

      datasetDeepSearch,
      [NodeInputKeyEnum.datasetDeepSearchModelId]: datasetDeepSearchModelId,
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
    // ⚠️ 热升级兼容：legacy-only dataset 回填 canonical 字段（getter 按名解析）
    const datasetModelIds = getDatasetModelIds(dataset ?? {});
    // Get Rerank Model (optional — undefined means no rerank step)
    const rerankModelData = rerankModelId ? getRerankModel(rerankModelId) : undefined;

    // Existence + active in one guard (F2-S3-TC06); rerank is optional so it
    // only gets the active check.
    const vectorModel = assertModelUsable(
      datasetModelIds.vectorModelId ? getEmbeddingModel(datasetModelIds.vectorModelId) : undefined
    );
    assertModelActive(rerankModelData);

    // start search
    const searchData = {
      histories,
      teamId,
      textQueries,
      imageQueries,
      vectorModelId: vectorModel.id,
      vlmModelId: datasetModelIds.vlmModelId,
      similarity,
      limit,
      datasetIds,
      searchMode,
      embeddingWeight,
      usingReRank,
      [NodeInputKeyEnum.datasetSearchRerankModelId]: rerankModelData?.id,
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
          datasetDeepSearchModelId,
          datasetDeepSearchMaxTimes,
          datasetDeepSearchBg
        })
      : await defaultSearchDatasetData({
          ...searchData,
          datasetSearchUsingExtensionQuery,
          datasetSearchExtensionModelId,
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
          modelData: vectorModel,
          inputTokens: embeddingTokens
        });
      nodeUsages.push({
        totalPoints: embeddingTotalPoints,
        moduleName: node.name,
        modelId: vectorModel.id,
        model: embeddingModelName,
        inputTokens: embeddingTokens
      });
      // 2. Rerank
      if (searchUsingReRank && rerankModelData) {
        const { totalPoints: reRankTotalPoints, modelName: reRankModelName } =
          formatModelChars2Points({
            modelData: rerankModelData,
            inputTokens: reRankInputTokens
          });
        nodeUsages.push({
          totalPoints: reRankTotalPoints,
          moduleName: i18nT('account_usage:rerank'),
          modelId: rerankModelData.id,
          model: reRankModelName,
          inputTokens: reRankInputTokens
        });
      }
      // 3. Query extension
      if (queryExtensionResult) {
        const { totalPoints, modelName: llmModelName } = formatModelChars2Points({
          modelData: getLLMModel(queryExtensionResult.llmModelId),
          inputTokens: queryExtensionResult.inputTokens,
          outputTokens: queryExtensionResult.outputTokens
        });
        const llmPoints = queryExtensionResult.usedUserOpenAIKey ? 0 : totalPoints;
        const queryExtensionUsage: ChatNodeUsageType = {
          totalPoints: llmPoints,
          moduleName: i18nT('common:core.module.template.Query extension'),
          modelId: queryExtensionResult.llmModelId,
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
            modelData: getEmbeddingModel(queryExtensionResult.embeddingModelId),
            inputTokens: queryExtensionResult.embeddingTokens
          });
        nodeUsages.push({
          totalPoints: embeddingPoints,
          moduleName: `${i18nT('account_usage:ai.query_extension_embedding')}`,
          modelId: queryExtensionResult.embeddingModelId,
          model: embeddingModelName,
          inputTokens: queryExtensionResult.embeddingTokens,
          outputTokens: 0
        });
      }
      // 4. Image caption
      if (imageCaptionResult) {
        const { totalPoints, modelName } = formatModelChars2Points({
          modelData: getVlmModel(imageCaptionResult.vlmModelId),
          inputTokens: imageCaptionResult.inputTokens,
          outputTokens: imageCaptionResult.outputTokens
        });
        const imageCaptionPoints = imageCaptionResult.usedUserOpenAIKey ? 0 : totalPoints;
        const imageCaptionUsage: ChatNodeUsageType = {
          totalPoints: imageCaptionPoints,
          moduleName: i18nT('account_usage:image_parse'),
          modelId: imageCaptionResult.vlmModelId,
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
          modelData: getLLMModel(deepSearchResult.llmModelId),
          inputTokens: deepSearchResult.inputTokens,
          outputTokens: deepSearchResult.outputTokens
        });
        nodeUsages.push({
          totalPoints,
          moduleName: i18nT('common:deep_rag_search'),
          modelId: deepSearchResult.llmModelId,
          model: modelName,
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
        embeddingModelId: vectorModel.id,
        embeddingModel: vectorModel.name,
        embeddingTokens,
        similarity: usingSimilarityFilter ? similarity : undefined,
        limit,
        searchMode,
        embeddingWeight:
          searchMode === DatasetSearchModeEnum.mixedRecall ? embeddingWeight : undefined,
        queryExtensionResult,
        // Rerank
        ...(searchUsingReRank && {
          rerankModelId: rerankModelData?.id,
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
