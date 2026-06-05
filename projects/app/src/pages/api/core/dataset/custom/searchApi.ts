import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { pushDatasetTestUsage } from '@/service/support/wallet/usage/push';
import {
  deepRagSearch,
  defaultSearchDatasetData
} from '@fastgpt/service/core/dataset/search/controller';
import { getLocale } from '@fastgpt/service/common/middle/i18n';
import { updateApiKeyUsage } from '@fastgpt/service/support/openapi/tools';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { checkTeamAIPoints } from '@fastgpt/service/support/permission/teamLimit';
import { NextAPI } from '@/service/middleware/entry';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { getRerankModelById } from '@fastgpt/service/core/ai/model';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { assertModelAvailable, authModel } from '@fastgpt/service/support/permission/model/auth';
import type { RerankMethodEnum } from '@fastgpt/global/core/dataset/constants';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { filterCollectionsByTmbId } from '@fastgpt/service/core/dataset/utils';
import {
  SearchApiBodySchema,
  SearchApiResponseSchema,
  type SearchApiBody,
  type SearchApiResponse
} from '@fastgpt/global/openapi/core/dataset/api';

async function handler(req: ApiRequestProps<SearchApiBody>): Promise<SearchApiResponse> {
  const {
    datasetIds,
    text,
    limit = 5000,
    similarity,
    searchMode,
    embeddingWeight,
    embeddingModelId,

    usingReRank,
    rerankModelId,
    rerankMethod,
    rerankWeight,

    datasetSearchUsingExtensionQuery = false,
    datasetSearchExtensionModelId,
    datasetSearchExtensionBg,

    agenticSearch = false,
    datasetDeepSearchModelId,
    datasetDeepSearchMaxTimes,
    datasetDeepSearchBg,

    collectionFilterMatch
  } = SearchApiBodySchema.parse(req.body);

  if (!datasetIds || datasetIds.length === 0) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  const start = Date.now();

  // --- Auth first dataset ---
  const {
    dataset: firstDataset,
    teamId,
    tmbId,
    userId,
    apikey
  } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId: datasetIds[0],
    per: ReadPermissionVal
  });

  // auth balance
  await checkTeamAIPoints(teamId);

  // --- Auth remaining datasets and verify same embedding model ---
  const datasets = [firstDataset];
  for (let i = 1; i < datasetIds.length; i++) {
    const { dataset } = await authDataset({
      req,
      authToken: true,
      authApiKey: true,
      datasetId: datasetIds[i],
      per: ReadPermissionVal
    });
    if (String(dataset.teamId) !== String(teamId)) {
      return Promise.reject(new Error('All datasets must belong to the same team'));
    }
    datasets.push(dataset);
  }

  // --- Verify all datasets use the same embedding model ---
  const resolvedEmbeddingModelId = embeddingModelId || firstDataset.vectorModelId;
  for (const ds of datasets) {
    const dsEmbeddingModelId = embeddingModelId || ds.vectorModelId;
    if (dsEmbeddingModelId !== resolvedEmbeddingModelId) {
      return Promise.reject(
        new Error(
          `All datasets must use the same embedding model. Dataset "${ds.name}" uses model "${ds.vectorModelId}", but expected "${resolvedEmbeddingModelId}". Please pass a consistent embeddingModelId.`
        )
      );
    }
  }

  // --- Auth models ---
  await Promise.all([
    authModel({
      req,
      authToken: true,
      authApiKey: true,
      modelId: resolvedEmbeddingModelId,
      per: ReadPermissionVal
    }).then(({ model }) => {
      assertModelAvailable(model, { type: ModelTypeEnum.embedding });
    }),
    usingReRank && rerankModelId
      ? authModel({
          req,
          authToken: true,
          authApiKey: true,
          modelId: rerankModelId,
          per: ReadPermissionVal
        }).then(({ model }) => {
          assertModelAvailable(model, { type: ModelTypeEnum.rerank });
        })
      : undefined,
    datasetSearchUsingExtensionQuery && datasetSearchExtensionModelId
      ? authModel({
          req,
          authToken: true,
          authApiKey: true,
          modelId: datasetSearchExtensionModelId,
          per: ReadPermissionVal
        }).then(({ model }) => {
          assertModelAvailable(model, { type: ModelTypeEnum.llm });
        })
      : undefined,
    agenticSearch && datasetDeepSearchModelId
      ? authModel({
          req,
          authToken: true,
          authApiKey: true,
          modelId: datasetDeepSearchModelId,
          per: ReadPermissionVal
        }).then(({ model }) => {
          assertModelAvailable(model, { type: ModelTypeEnum.llm });
        })
      : undefined
  ]);

  // --- Collection-level permission filtering ---
  let authForbidCollectionIds: string[] | undefined;
  if (tmbId) {
    const collectionFilterResult = await filterCollectionsByTmbId({
      datasetIds,
      tmbId,
      teamId
    });
    if (!collectionFilterResult.allPass) {
      authForbidCollectionIds = collectionFilterResult.forbiddenIds;
    }
  }

  const rerankModelData = getRerankModelById(rerankModelId);
  const rerankMethodEnum = rerankMethod as RerankMethodEnum;

  const searchData = {
    histories: [],
    teamId,
    reRankQuery: text,
    queries: [text],
    modelId: resolvedEmbeddingModelId,
    limit: Math.min(limit, 20000),
    similarity,
    datasetIds,
    searchMode,
    embeddingWeight,
    usingReRank,
    rerankModel: rerankModelData,
    rerankMethod: rerankMethodEnum,
    rerankWeight,
    lang: getLocale(req),
    collectionFilterMatch: collectionFilterMatch
      ? JSON.stringify(collectionFilterMatch)
      : undefined,
    authForbidCollectionIds
  };

  const {
    searchRes,
    embeddingTokens,
    reRankInputTokens,
    usingReRank: searchUsingReRank,
    queryExtensionResult,
    deepSearchResult,
    agenticSearchResult,
    ...result
  } = agenticSearch
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
        datasetSearchExtensionBg
      });

  // --- Billing ---
  const source = apikey ? UsageSourceEnum.api : UsageSourceEnum.fastgpt;
  const { totalPoints } = pushDatasetTestUsage({
    teamId,
    tmbId,
    source,
    embUsage: {
      modelId: resolvedEmbeddingModelId,
      inputTokens: embeddingTokens
    },
    rerankUsage: searchUsingReRank
      ? {
          modelId: rerankModelData.id,
          inputTokens: reRankInputTokens
        }
      : undefined,
    extensionUsage: queryExtensionResult
      ? {
          modelId: queryExtensionResult.llmModelId,
          inputTokens: queryExtensionResult.inputTokens,
          outputTokens: queryExtensionResult.outputTokens,
          embeddingTokens: queryExtensionResult.embeddingTokens,
          embeddingModelId: resolvedEmbeddingModelId
        }
      : undefined
  });

  if (apikey) {
    updateApiKeyUsage({
      apikey,
      totalPoints
    });
  }

  return SearchApiResponseSchema.parse({
    list: searchRes,
    duration: `${((Date.now() - start) / 1000).toFixed(3)}s`,
    queryExtensionModelId: queryExtensionResult?.llmModelId,
    usingReRank: searchUsingReRank,
    agenticSearchResult: agenticSearchResult
      ? {
          reasoningText: agenticSearchResult.reasoningText,
          searchCount: agenticSearchResult.searchCount,
          toolCallCount: agenticSearchResult.toolCallCount
        }
      : undefined,
    ...result
  });
}

export default NextAPI(handler);
