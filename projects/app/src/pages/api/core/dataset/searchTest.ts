import type { SearchTestProps, SearchTestResponse } from '@/global/core/dataset/api.d';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { pushGenerateVectorUsage } from '@/service/support/wallet/usage/push';
import {
  deepRagSearch,
  defaultSearchDatasetData
} from '@fastgpt/service/core/dataset/search/controller';
import { updateApiKeyUsage } from '@fastgpt/service/support/openapi/tools';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import {
  checkTeamAIPoints,
  checkTeamReRankPermission
} from '@fastgpt/service/support/permission/teamLimit';
import { NextAPI } from '@/service/middleware/entry';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { useIPFrequencyLimit } from '@fastgpt/service/common/middle/reqFrequencyLimit';
import { ApiRequestProps } from '@fastgpt/service/type/next';

async function handler(req: ApiRequestProps<SearchTestProps>): Promise<SearchTestResponse> {
  const {
    datasetId,
    text,
    limit = 1500,
    similarity,
    searchMode,
    usingReRank,

    datasetSearchUsingExtensionQuery = false,
    datasetSearchExtensionModel,
    datasetSearchExtensionBg,

    datasetDeepSearch = false,
    datasetDeepSearchModel,
    datasetDeepSearchMaxTimes,
    datasetDeepSearchBg
  } = req.body;

  if (!datasetId || !text) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  const start = Date.now();

  // auth dataset role
  const { dataset, teamId, tmbId, apikey } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId,
    per: ReadPermissionVal
  });
  // auth balance
  await checkTeamAIPoints(teamId);

  const searchData = {
    histories: [],
    teamId,
    reRankQuery: text,
    queries: [text],
    model: dataset.vectorModel,
    limit: Math.min(limit, 20000),
    similarity,
    datasetIds: [datasetId],
    searchMode,
    usingReRank: usingReRank && (await checkTeamReRankPermission(teamId))
  };
  const { searchRes, tokens, queryExtensionResult, deepSearchResult, ...result } = datasetDeepSearch
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
  const { totalPoints } = pushGenerateVectorUsage({
    teamId,
    tmbId,
    inputTokens: tokens,
    model: dataset.vectorModel,
    source: apikey ? UsageSourceEnum.api : UsageSourceEnum.fastgpt,

    ...(queryExtensionResult && {
      extensionModel: queryExtensionResult.model,
      extensionInputTokens: queryExtensionResult.inputTokens,
      extensionOutputTokens: queryExtensionResult.outputTokens
    }),
    ...(deepSearchResult && {
      deepSearchModel: deepSearchResult.model,
      deepSearchInputTokens: deepSearchResult.inputTokens,
      deepSearchOutputTokens: deepSearchResult.outputTokens
    })
  });
  if (apikey) {
    updateApiKeyUsage({
      apikey,
      totalPoints: totalPoints
    });
  }

  return {
    list: searchRes,
    duration: `${((Date.now() - start) / 1000).toFixed(3)}s`,
    queryExtensionModel: queryExtensionResult?.model,
    ...result
  };
}

export default NextAPI(useIPFrequencyLimit({ id: 'search-test', seconds: 1, limit: 15 }), handler);
