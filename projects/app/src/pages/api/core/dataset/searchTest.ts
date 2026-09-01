import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { resolveReadableCollectionIds } from '@fastgpt/service/support/permission/collection/auth';
import { pushDatasetTestUsage } from '@/service/support/wallet/usage/push';
import { deepRagSearch, defaultSearchDatasetData } from '@fastgpt/service/core/dataset/search';
import { updateApiKeyUsage } from '@fastgpt/service/support/openapi/tools';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { checkTeamAIPoints } from '@fastgpt/service/support/permission/teamLimit';
import { NextAPI } from '@/service/middleware/entry';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { type ApiRequestProps } from '@fastgpt/next/type';
import type { NextApiResponse } from 'next';
import { getRerankModel } from '@fastgpt/service/core/ai/model';
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
    rerankModel,
    rerankWeight,

    datasetSearchUsingExtensionQuery = false,
    datasetSearchExtensionModel,
    datasetSearchExtensionBg,

    datasetDeepSearch = false,
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

  // Collection 级权限可读集合：undefined=无需过滤；真子集=仅这些 collection 可召回
  const readableCollectionIdList = await resolveReadableCollectionIds({
    teamId,
    datasetIds: [datasetId],
    tmbId
  });

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

  const rerankModelData = getRerankModel(rerankModel);

  const searchData = {
    histories: [],
    teamId,
    tmbId,
    reRankQuery: text,
    textQueries: text ? [text] : [],
    imageQueries: validQueryImageUrls,
    model: dataset.vectorModel,
    vlmModel: dataset.vlmModel,
    limit: Math.min(limit, 20000),
    similarity,
    datasetIds: [datasetId],
    searchMode,
    embeddingWeight,
    usingReRank,
    rerankModel: rerankModelData,
    rerankWeight,
    readableCollectionIdList
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

  // push bill
  const source = apikey ? UsageSourceEnum.api : UsageSourceEnum.fastgpt;
  const { totalPoints } = pushDatasetTestUsage({
    teamId,
    tmbId,
    source,
    embUsage: {
      model: dataset.vectorModel,
      inputTokens: embeddingTokens
    },
    rerankUsage: searchUsingReRank
      ? {
          model: rerankModelData.model,
          inputTokens: reRankInputTokens
        }
      : undefined,
    extensionUsage: queryExtensionResult
      ? {
          model: queryExtensionResult.llmModel,
          inputTokens: queryExtensionResult.inputTokens,
          outputTokens: queryExtensionResult.outputTokens,
          embeddingTokens: queryExtensionResult.embeddingTokens,
          embeddingModel: dataset.vectorModel
        }
      : undefined,
    imageCaptionUsage: imageCaptionResult
      ? {
          model: imageCaptionResult.model,
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
