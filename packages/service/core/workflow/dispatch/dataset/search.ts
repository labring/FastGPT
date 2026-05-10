import { type DispatchNodeResultType } from '@fastgpt/global/core/workflow/runtime/type';
import { formatModelChars2Points } from '../../../../support/wallet/usage/utils';
import type { SelectedDatasetType } from '@fastgpt/global/core/workflow/type/io';
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
import { getDatasetSearchToolResponsePrompt } from '@fastgpt/global/core/ai/prompt/dataset.const';
import { getNodeErrResponse } from '../utils';
import { getLogger, LogCategories } from '../../../../common/logger';
import { ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';
import { formatQueryImages, getWorkflowContext, parseUrlToFileType } from '../../utils/context';

const logger = getLogger(LogCategories.MODULE.WORKFLOW.DATASET);

type DatasetSearchProps = ModuleDispatchProps<{
  [NodeInputKeyEnum.datasetSelectList]: SelectedDatasetType[];
  [NodeInputKeyEnum.datasetSimilarity]: number;
  [NodeInputKeyEnum.datasetMaxTokens]: number;
  [NodeInputKeyEnum.userChatInput]?: string | string[];
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

const isLikelyFileLinkValue = (input: string) => {
  if (/^(data:|dataset\/|chat\/|temp\/)/i.test(input)) return true;
  if (getWorkflowContext()?.queryUrlTypeMap?.[input]) return true;
  return false;
};

const normalizeDatasetSearchInput = (input?: string | string[]) => {
  const inputList = (Array.isArray(input) ? input : [input])
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);

  const textQueries: string[] = [];
  const queryImageUrls: string[] = [];
  let filteredFileCount = 0;

  for (const item of inputList) {
    if (isLikelyFileLinkValue(item)) {
      const fileInfo = parseUrlToFileType(item);
      if (fileInfo?.type === ChatFileTypeEnum.image) {
        queryImageUrls.push(item);
      } else {
        filteredFileCount++;
      }
      continue;
    }

    textQueries.push(item);
  }

  return {
    textQueries,
    queryImageUrls,
    filteredFileCount
  };
};

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

  const { textQueries, queryImageUrls, filteredFileCount } =
    normalizeDatasetSearchInput(userChatInput);
  const normalizedUserChatInput = textQueries.join('\n');
  const queryImages = formatQueryImages(queryImageUrls);

  if (!normalizedUserChatInput && queryImageUrls.length === 0) {
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
      reRankQuery: normalizedUserChatInput,
      queries: textQueries,
      queryImageUrls,
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
    const {
      searchRes,
      embeddingTokens,
      reRankInputTokens,
      usingSimilarityFilter,
      usingReRank: searchUsingReRank,
      queryExtensionResult,
      imageCaptionResult,
      deepSearchResult
    } = datasetDeepSearch && textQueries.length > 0
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
    const nodeUsages: ChatNodeUsageType[] = [];
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
        const { totalPoints: llmPoints, modelName: llmModelName } = formatModelChars2Points({
          model: queryExtensionResult.llmModel,
          inputTokens: queryExtensionResult.inputTokens,
          outputTokens: queryExtensionResult.outputTokens
        });
        nodeUsages.push({
          totalPoints: llmPoints,
          moduleName: i18nT('common:core.module.template.Query extension'),
          model: llmModelName,
          inputTokens: queryExtensionResult.inputTokens,
          outputTokens: queryExtensionResult.outputTokens
        });

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
        nodeUsages.push({
          totalPoints,
          moduleName: i18nT('account_usage:image_parse'),
          model: modelName,
          inputTokens: imageCaptionResult.inputTokens,
          outputTokens: imageCaptionResult.outputTokens
        });
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
    props.usagePush(nodeUsages);

    return {
      data: {
        quoteQA: searchRes
      },
      [DispatchNodeResponseKeyEnum.nodeResponse]: {
        totalPoints,
        query: normalizedUserChatInput,
        queryImages,
        filteredFileCount,
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
        queryExtensionResult: queryExtensionResult
          ? {
              model: queryExtensionResult.llmModel,
              inputTokens: queryExtensionResult.inputTokens,
              outputTokens: queryExtensionResult.outputTokens,
              query: queryExtensionResult.query
            }
          : undefined,
        deepSearchResult,
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
