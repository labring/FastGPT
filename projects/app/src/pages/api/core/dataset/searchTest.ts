import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { pushDatasetTestUsage } from '@/service/support/wallet/usage/push';
import { deepRagSearch, defaultSearchDatasetData } from '@fastgpt/service/core/dataset/search';
import { updateApiKeyUsage } from '@fastgpt/service/support/openapi/tools';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { checkTeamAIPoints } from '@fastgpt/service/support/permission/teamLimit';
import { NextAPI } from '@/service/middleware/entry';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { type ApiRequestProps } from '@fastgpt/next/type';
import type { NextApiResponse } from 'next';
import { getLLMModelData, getRerankModelData } from '@fastgpt/service/core/ai/model';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { getI18nDatasetType } from '@fastgpt/service/support/user/audit/util';
import { isAuthorizedTempFileS3Key } from '@fastgpt/service/common/s3/sources/temp/key';
import { getS3DatasetSource } from '@fastgpt/service/common/s3/sources/dataset';
import {
  SearchDatasetTestBodySchema,
  SearchDatasetTestResponseSchema,
  type SearchDatasetTestBody,
  type SearchDatasetTestResponse
} from '@fastgpt/global/openapi/core/dataset/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { LimitTypeEnum, teamFrequencyLimit } from '@fastgpt/service/common/api/frequencyLimit';
import { getDatasetEmbeddingModel, getDatasetVlmModel } from '@fastgpt/service/core/dataset/model';

export async function handler(
  req: ApiRequestProps<SearchDatasetTestBody>,
  res: NextApiResponse
): Promise<SearchDatasetTestResponse | void> {
  const {
    datasetId,
    text,
    queryImageUrls,
    limit = 5000,
    similarity,
    searchMode,
    embeddingWeight,

    usingReRank,
    rerankModelId,
    rerankModel,
    rerankWeight,

    datasetSearchUsingExtensionQuery = false,
    datasetSearchExtensionModelId,
    datasetSearchExtensionModel,
    datasetSearchExtensionBg,

    datasetDeepSearch = false,
    datasetDeepSearchModelId,
    datasetDeepSearchModel,
    datasetDeepSearchMaxTimes,
    datasetDeepSearchBg
  } = parseApiInput({ req, bodySchema: SearchDatasetTestBodySchema }).body;

  const start = Date.now();

  // auth dataset role
  const { dataset, teamId, tmbId, apikey } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId,
    per: ReadPermissionVal
  });
  if (!(await teamFrequencyLimit({ teamId, type: LimitTypeEnum.chat, res }))) return;
  // auth balance
  await checkTeamAIPoints(teamId);

  // Search-test images must be temp objects created by this team. Client-supplied keys are not
  // proof of ownership, so reject dataset/chat/foreign-team keys before any S3 read happens.
  const validQueryImageKeys = queryImageUrls.filter((key) =>
    isAuthorizedTempFileS3Key({ key, teamId })
  );

  if (validQueryImageKeys.length !== queryImageUrls.length) {
    return Promise.reject('Invalid query image key');
  }

  // 搜索主链路只接收模型可读图片 URL；temp key 的鉴权和临时 URL 生成固定在入口层完成。
  const validQueryImageUrls = await Promise.all(
    validQueryImageKeys.map(async (key) => {
      const { url } = await getS3DatasetSource().createExternalUrl({
        key,
        expiredHours: 1
      });
      return url;
    })
  );

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
  const embeddingModelData = getDatasetEmbeddingModel(dataset);
  const vlmModelData = getDatasetVlmModel(dataset);

  const searchData = {
    histories: [],
    teamId,
    reRankQuery: text,
    textQueries: text ? [text] : [],
    imageQueries: validQueryImageUrls,
    model: embeddingModelData,
    vlmModel: vlmModelData,
    limit: Math.min(limit, 20000),
    similarity,
    datasetIds: [datasetId],
    searchMode,
    embeddingWeight,
    usingReRank,
    rerankModel: rerankModelData,
    rerankWeight
  };
  const {
    searchRes,
    embeddingTokens,
    reRankInputTokens,
    usingReRank: searchUsingReRank,
    queryExtensionResult,
    imageCaptionResult,
    ...result
  } = datasetDeepSearch && !!text.trim()
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
        datasetSearchExtensionBg
      });

  // push bill
  const source = apikey ? UsageSourceEnum.api : UsageSourceEnum.fastgpt;
  const { totalPoints } = pushDatasetTestUsage({
    teamId,
    tmbId,
    source,
    embUsage: {
      model: embeddingModelData,
      inputTokens: embeddingTokens
    },
    rerankUsage:
      searchUsingReRank && rerankModelData
        ? {
            model: rerankModelData,
            inputTokens: reRankInputTokens
          }
        : undefined,
    extensionUsage:
      queryExtensionResult && extensionModelData
        ? {
            model: extensionModelData,
            inputTokens: queryExtensionResult.inputTokens,
            outputTokens: queryExtensionResult.outputTokens,
            embeddingTokens: queryExtensionResult.embeddingTokens,
            embeddingModel: embeddingModelData
          }
        : undefined,
    imageCaptionUsage:
      imageCaptionResult && vlmModelData
        ? {
            model: vlmModelData,
            inputTokens: imageCaptionResult.inputTokens,
            outputTokens: imageCaptionResult.outputTokens
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
    queryExtensionModel: queryExtensionResult?.llmModel,
    usingReRank: searchUsingReRank,
    ...result
  });
}

export default NextAPI(handler);
