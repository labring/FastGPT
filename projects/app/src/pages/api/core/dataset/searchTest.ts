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
import { useIPFrequencyLimit } from '@fastgpt/service/common/middle/reqFrequencyLimit';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { getRerankModelById } from '@fastgpt/service/core/ai/model';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { getI18nDatasetType } from '@fastgpt/service/support/user/audit/util';
import type { RerankMethodEnum } from '@fastgpt/global/core/dataset/constants';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { assertModelAvailable, authModel } from '@fastgpt/service/support/permission/model/auth';
import {
  SearchDatasetTestBodySchema,
  SearchDatasetTestResponseSchema,
  type SearchDatasetTestBody,
  type SearchDatasetTestResponse
} from '@fastgpt/global/openapi/core/dataset/api';

async function handler(
  req: ApiRequestProps<SearchDatasetTestBody>
): Promise<SearchDatasetTestResponse> {
  const {
    datasetId,
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

    datasetDeepSearch = false,
    datasetDeepSearchModelId,
    datasetDeepSearchMaxTimes,
    datasetDeepSearchBg
  } = SearchDatasetTestBodySchema.parse(req.body);

  const start = Date.now();

  // auth dataset role
  const { dataset, teamId, tmbId, userId, apikey } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId,
    per: ReadPermissionVal
  });
  // auth balance
  await checkTeamAIPoints(teamId);

  await Promise.all([
    authModel({
      req,
      authToken: true,
      authApiKey: true,
      modelId: embeddingModelId || dataset.vectorModelId,
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
    datasetDeepSearch && datasetDeepSearchModelId
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

  const rerankModelData = getRerankModelById(rerankModelId);

  // Convert rerankMethod string to RerankMethodEnum
  const rerankMethodEnum = rerankMethod as RerankMethodEnum;

  const searchData = {
    histories: [],
    teamId,
    reRankQuery: text,
    queries: [text],
    modelId: embeddingModelId || dataset.vectorModelId,
    limit: Math.min(limit, 20000),
    similarity,
    datasetIds: [datasetId],
    searchMode,
    embeddingWeight,
    usingReRank,
    rerankModel: rerankModelData,
    rerankMethod: rerankMethodEnum,
    rerankWeight,
    lang: getLocale(req)
  };
  const {
    searchRes,
    embeddingTokens,
    reRankInputTokens,
    usingReRank: searchUsingReRank,
    queryExtensionResult,
    deepSearchResult,
    ...result
  } = datasetDeepSearch
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

  // push bill
  const source = apikey ? UsageSourceEnum.api : UsageSourceEnum.fastgpt;
  const { totalPoints } = pushDatasetTestUsage({
    teamId,
    tmbId,
    source,
    embUsage: {
      modelId: embeddingModelId || dataset.vectorModelId,
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
          embeddingModelId: embeddingModelId || dataset.vectorModelId
        }
      : undefined
  });

  if (apikey) {
    updateApiKeyUsage({
      apikey,
      totalPoints
    });
  }

  (async () => {
    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.SEARCH_TEST,
      params: {
        datasetName: dataset.name,
        datasetType: getI18nDatasetType(dataset.type)
      }
    });
  })();

  return SearchDatasetTestResponseSchema.parse({
    list: searchRes,
    duration: `${((Date.now() - start) / 1000).toFixed(3)}s`,
    queryExtensionModelId: queryExtensionResult?.llmModelId,
    usingReRank: searchUsingReRank,
    ...result
  });
}

export default NextAPI(useIPFrequencyLimit({ id: 'search-test', seconds: 1, limit: 15 }), handler);
