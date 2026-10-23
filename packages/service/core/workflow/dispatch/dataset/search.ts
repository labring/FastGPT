import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constants';
import type { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import type { NodeOutputKeyEnum, NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';

import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { SelectedDatasetType } from '@fastgpt/global/core/workflow/type/io';
import { type ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import { getLogger, LogCategories } from '../../../../common/logger';
import { resolveReadableCollectionIds } from '../../../../support/permission/collection/auth';
import { formatModelChars2Points } from '../../../../support/wallet/usage/utils';
import { getTeamModelHandle } from '../../../ai/model/catalog/service';
import { deepRagSearch, defaultSearchDatasetData } from '../../../dataset/search';
import { getDatasetSearchVlmModel } from '../../../dataset/search/vlm';
import { filterDatasetsByTmbId } from '../../../dataset/utils';
import type { DispatchNodeResultType, ModuleDispatchProps } from '../../types/runtime';
import {
  isWorkflowResourceError,
  loadWorkflowDatasetResource,
  loadWorkflowModelResource
} from '../../resource/service';
import { getNodeErrResponse } from '../utils';
import {
  createImageCaptionChildNodeResponse,
  createQueryExtensionChildNodeResponse
} from './nodeResponse';
import { normalizeDatasetSearchInput } from './utils';
import { formatDatasetSearchToolResponse } from './toolResponse';

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

/**
 * 识别知识库缺失及兼容的工作流资源错误，只对已知资源问题降级日志。
 * 加载器须原样抛出数据库等系统异常，避免将查询失败误判为资源不存在。
 */
export const isDatasetResourceMissingError = (error: unknown): boolean => {
  if (isWorkflowResourceError(error)) return true;
  if (error === DatasetErrEnum.unExist) return true;

  const errObj = error as { message?: string; statusText?: string } | null;
  if (typeof errObj === 'object' && errObj !== null) {
    if (errObj.message === DatasetErrEnum.unExist || errObj.statusText === DatasetErrEnum.unExist) {
      return true;
    }
  }

  return false;
};

/** 知识库检索工作流节点执行入口 */
export const dispatchDatasetSearch = async (
  props: DatasetSearchProps
): Promise<DatasetSearchResponse> => {
  const {
    runningAppInfo: { teamId },
    runningUserInfo,
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
  const { tmbId } = runningUserInfo;
  const userInfo = {
    teamId: runningUserInfo.teamId || teamId,
    tmbId
  };

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

  const { textQueries, imageQueries } = await normalizeDatasetSearchInput(searchQueries);
  if (textQueries.length === 0 && imageQueries.length === 0) {
    return emptyResult;
  }

  try {
    const requestedDatasetIds = datasets.map((item) => item.datasetId);
    const datasetIds = authTmbId
      ? await filterDatasetsByTmbId({
          datasetIds: requestedDatasetIds,
          tmbId
        })
      : requestedDatasetIds;

    if (datasetIds.length === 0) {
      return emptyResult;
    }

    // Collection 级权限可读集合仅对真实成员鉴权生效；authTmbId=false（应用内预选 dataset，
    // 无当前用户身份）时不做 collection 级过滤，按 dataset 全量召回。
    const readableCollectionIdList = authTmbId
      ? await resolveReadableCollectionIds({
          teamId: userInfo.teamId,
          datasetIds,
          tmbId
        })
      : undefined;

    // Get vector model
    const dataset = await loadWorkflowDatasetResource({
      datasetId: datasetIds[0],
      datasetIds,
      tmbId
    });
    const modelHandle = await getTeamModelHandle({ teamId });
    const vectorModel = modelHandle.getModelData(
      {
        modelId: dataset?.vectorModelId,
        model: dataset?.vectorModel
      },
      { type: 'embedding' }
    );
    const vlmModel = await getDatasetSearchVlmModel({ teamId, datasetIds, modelHandle });
    const rerankModelData = usingReRank
      ? await loadWorkflowModelResource({
          appTeamId: teamId,
          userInfo,
          modelId: rerankModelId,
          model: rerankModel,
          type: 'rerank',
          fallbackToDefault: true,
          modelHandle
        })
      : undefined;
    const extensionModelData = datasetSearchUsingExtensionQuery
      ? await loadWorkflowModelResource({
          appTeamId: teamId,
          userInfo,
          modelId: datasetSearchExtensionModelId,
          model: datasetSearchExtensionModel,
          fallbackToDefault: true,
          modelHandle
        })
      : undefined;
    const deepSearchModelData = datasetDeepSearch
      ? await loadWorkflowModelResource({
          appTeamId: teamId,
          userInfo,
          modelId: datasetDeepSearchModelId,
          model: datasetDeepSearchModel,
          modelHandle
        })
      : undefined;

    // start search
    const searchData = {
      histories,
      teamId,
      tmbId,
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
      collectionFilterMatch,
      readableCollectionIdList
    };
    const useDeepSearch = datasetDeepSearch && textQueries.length > 0;
    const {
      searchRes,
      embeddingTokens,
      reRankInputTokens,
      usingSimilarityFilter,
      usingReRank: searchUsingReRank,
      retrievalResults,
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
    let childrenResponsePoints = 0;
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
        childrenResponsePoints += queryExtensionUsage.totalPoints;
        childrenResponses.push(
          createQueryExtensionChildNodeResponse({
            requestIds: [queryExtensionResult.requestId],
            usage: queryExtensionUsage,
            modelName: extensionModelData!.name,
            seconds: queryExtensionResult.seconds,
            query: queryExtensionResult.query,
            embeddingTokens: queryExtensionResult.embeddingTokens
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
        childrenResponsePoints += imageCaptionUsage.totalPoints;
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
    // 子 LLM 响应已经分别记录积分，父知识库响应只保留自身检索消耗。
    const totalPoints =
      nodeUsages.reduce((acc, item) => acc + item.totalPoints, 0) - childrenResponsePoints;
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
        quoteList: searchRes,
        // 融合候选集快照，仅在重排开启且未超过上限时由检索层产出，便于日志详情对比召回与重排结果
        ...(retrievalResults?.length ? { retrievalResults } : {})
      },
      [DispatchNodeResponseKeyEnum.toolResponse]:
        searchRes.length > 0 ? formatDatasetSearchToolResponse(searchRes) : 'No results'
    };
  } catch (error) {
    if (isDatasetResourceMissingError(error)) {
      logger.warn('Dataset search dispatch failed', { error });
    } else {
      logger.error('Dataset search dispatch failed', { error });
    }
    return getNodeErrResponse({ error });
  }
};
