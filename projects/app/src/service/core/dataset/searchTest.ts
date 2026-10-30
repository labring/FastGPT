import type {
  SearchDatasetTestBody,
  SearchDatasetTestResponse
} from '@fastgpt/global/openapi/core/dataset/api';
import type { DatasetSearchParams } from '@fastgpt/global/core/dataset/search/type';
import { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constants';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import { getTeamModelHandle } from '@fastgpt/service/core/ai/model/catalog/service';
import { getAuthorizedModelIds } from '@fastgpt/service/support/permission/model/auth';
import { searchDatasetForApi } from './search';

/**
 * 旧单库搜索协议适配。保留模型名称、无效辅助模型回退与 20000 token 截断；
 * 权限、图片鉴权、搜索和计量统一交给新的搜索应用服务。
 */
export const searchDatasetTestForApi = async ({
  params,
  auth,
  onRateLimit
}: {
  params: SearchDatasetTestBody;
  auth: Parameters<typeof searchDatasetForApi>[0]['auth'];
  onRateLimit?: Parameters<typeof searchDatasetForApi>[0]['onRateLimit'];
}): Promise<SearchDatasetTestResponse> => {
  const modelHandle = await getTeamModelHandle({ teamId: auth.teamId });
  const authorizedIds = await getAuthorizedModelIds({ actor: auth, handle: modelHandle });
  const rerankModel = params.usingReRank
    ? modelHandle.getModelData(
        { modelId: params.rerankModelId, model: params.rerankModel },
        { type: 'rerank', authorizedIds, fallbackToDefault: true }
      )
    : undefined;
  const extensionModel = params.datasetSearchUsingExtensionQuery
    ? modelHandle.getModelData(
        {
          modelId: params.datasetSearchExtensionModelId,
          model: params.datasetSearchExtensionModel
        },
        { type: 'llm', authorizedIds, fallbackToDefault: true }
      )
    : undefined;
  // 旧协议已由 API 边界校验；只补齐共享服务的默认值，保留历史数值和文本范围。
  const searchParams: DatasetSearchParams = {
    scope: { datasetIds: [params.datasetId] },
    query: { text: params.text, imageKeys: params.queryImageUrls },
    retrieval: {
      mode: params.searchMode ?? DatasetSearchModeEnum.embedding,
      embeddingWeight: params.embeddingWeight ?? 0.5
    },
    rerank: params.usingReRank
      ? { enabled: true, modelId: rerankModel?.modelId, weight: params.rerankWeight ?? 0.5 }
      : { enabled: false },
    queryExtension: params.datasetSearchUsingExtensionQuery
      ? {
          enabled: true,
          modelId: extensionModel?.modelId,
          background: params.datasetSearchExtensionBg ?? ''
        }
      : { enabled: false },
    result: { maxTokens: Math.min(params.limit ?? 5000, 20000), similarity: params.similarity ?? 0 }
  };
  const result = await searchDatasetForApi({
    params: searchParams,
    auth,
    modelHandle,
    usageAppName: i18nT('account_usage:search_test'),
    ...(onRateLimit ? { onRateLimit } : {})
  });
  return {
    list: result.list,
    duration: `${(result.meta.durationMs / 1000).toFixed(3)}s`,
    limit: result.meta.maxTokens,
    searchMode: result.meta.searchMode,
    similarity: result.meta.similarity,
    usingReRank: result.meta.usingReRank,
    queryExtensionModel: result.meta.queryExtensionModelId ? extensionModel?.model : undefined
  };
};
