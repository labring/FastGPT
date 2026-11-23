import { VectorCountCache } from '@fastgpt/dal/redis/caches/vectorCount';
import {
  resolveDatasetIndexScale,
  type DatasetSearchModeMetricValue,
  type VectorEngineMetricValue
} from '@fastgpt/global/common/opsPerf/constants';
import { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constants';
import { getLogger, LogCategories } from '../../../common/logger';
import { withPerfContext } from '../../../common/opsPerf/context';
import { getVectorType } from '../../../common/vectorDB/constants';
import type { DefaultSearchDatasetDataProps, SearchDatasetDataResponse } from './type';
import { searchDatasetData } from './defaultRecall';
import { datasetSearchQueryExtension } from './utils';

export * from './type';

const perfVectorCountCache = new VectorCountCache({
  logger: getLogger(LogCategories.INFRA.REDIS)
});

/** 仅从 Redis 缓存读取知识库索引总行数，不回源向量库 COUNT，避免埋点带来额外 DB 压力。 */
const resolveCachedDatasetIndexCounts = async ({
  teamId,
  datasetIds
}: {
  teamId: string;
  datasetIds: string[];
}): Promise<{ totalIndexCount: number; maxDatasetIndexCount: number } | undefined> => {
  const uniqueIds = [...new Set(datasetIds.map(String))].filter(Boolean);
  if (uniqueIds.length === 0) return;

  const counts = await Promise.all(
    uniqueIds.map((datasetId) => perfVectorCountCache.get({ teamId: String(teamId), datasetId }))
  );
  if (counts.some((count) => count === undefined)) return;

  let totalIndexCount = 0;
  let maxDatasetIndexCount = 0;
  for (const count of counts as number[]) {
    totalIndexCount += count;
    if (count > maxDatasetIndexCount) maxDatasetIndexCount = count;
  }

  return { totalIndexCount, maxDatasetIndexCount };
};

/**
 * 知识库搜索统一入口。
 *
 * 入口层负责搜索前置编排：文本 query extension、rerank query 生成，以及后续搜索方式分发。
 * 当前只接入默认召回实现，调用方不直接依赖具体 recall 目录。
 */
export const defaultSearchDatasetData = async ({
  datasetSearchUsingExtensionQuery,
  datasetSearchExtensionModel,
  datasetSearchExtensionBg,
  userKey,
  ...props
}: DefaultSearchDatasetDataProps): Promise<SearchDatasetDataResponse> => {
  const textQueries = props.textQueries.map((query) => query.trim()).filter(Boolean);
  const query = textQueries.join('\n');
  const uniqueDatasetIds = [...new Set((props.datasetIds ?? []).map(String))].filter(Boolean);
  const initialMode = (props.searchMode ??
    DatasetSearchModeEnum.embedding) as DatasetSearchModeMetricValue;
  const vectorEngine = (getVectorType() ?? 'unknown') as VectorEngineMetricValue;

  return withPerfContext(
    {
      domain: 'dataset.search',
      teamId: props.teamId,
      resourceIds: uniqueDatasetIds,
      dims: {
        searchMode: initialMode,
        indexScale: 'unknown',
        usingReRank: Boolean(props.usingReRank && props.rerankModel),
        usingExtension: Boolean(datasetSearchUsingExtensionQuery && datasetSearchExtensionModel),
        vectorEngine
      },
      metrics: {
        totalDatasetCount: uniqueDatasetIds.length
      },
      detail: {
        datasetCount: uniqueDatasetIds.length,
        queryCount: textQueries.length,
        queryChars: query.length,
        imageQueryCount: props.imageQueries?.length ?? 0,
        embeddingModel: props.model?.model || props.model?.name,
        rerankModel: props.rerankModel?.model || props.rerankModel?.name,
        extensionModel: datasetSearchExtensionModel?.model || datasetSearchExtensionModel?.name
      },
      onFinalize: async ({ state, result }) => {
        if (result) {
          state.dims.searchMode = result.searchMode as DatasetSearchModeMetricValue;
          state.dims.usingReRank = Boolean(
            result.usingReRank || state.detail.rerankFallback === true
          );
          state.dims.usingExtension = Boolean(
            result.queryExtensionResult ||
              (datasetSearchUsingExtensionQuery && datasetSearchExtensionModel)
          );
          state.detail.resultCount = result.searchRes.length;
          state.metrics.totalResultCount =
            (state.metrics.totalResultCount ?? 0) + result.searchRes.length;
          if (result.embeddingTokens > 0) {
            state.metrics.totalEmbeddingTokens =
              (state.metrics.totalEmbeddingTokens ?? 0) + result.embeddingTokens;
          }
          if (result.reRankInputTokens > 0) {
            state.metrics.totalRerankTokens =
              (state.metrics.totalRerankTokens ?? 0) + result.reRankInputTokens;
          }
        }

        // PG 路由指标只在此处统一计数一次，避免多 query 并行召回重复累加。
        if (state.detail.pgUsesHnsw === true) {
          state.metrics.pgHnswCount = (state.metrics.pgHnswCount ?? 0) + 1;
        } else if (state.detail.pgUsesHnsw === false) {
          state.metrics.pgExactCount = (state.metrics.pgExactCount ?? 0) + 1;
        }

        // 非 PG 或未走向量召回时，脱离主链路异步尝试从 Redis 缓存补齐索引规模分桶。
        if (
          typeof state.detail.totalIndexCount !== 'number' &&
          props.teamId &&
          uniqueDatasetIds.length > 0
        ) {
          const cached = await resolveCachedDatasetIndexCounts({
            teamId: props.teamId,
            datasetIds: uniqueDatasetIds
          });
          if (cached) {
            state.detail.totalIndexCount = cached.totalIndexCount;
            state.detail.maxDatasetIndexCount = cached.maxDatasetIndexCount;
            state.dims.indexScale = resolveDatasetIndexScale(cached.totalIndexCount);
          }
        }
      }
    },
    async () => {
      const { searchQueries, reRankQuery, aiExtensionResult } = query
        ? await datasetSearchQueryExtension({
            query,
            llmModel: datasetSearchUsingExtensionQuery ? datasetSearchExtensionModel : undefined,
            embeddingModel: props.model,
            extensionBg: datasetSearchExtensionBg,
            histories: props.histories,
            datasetIds: props.datasetIds,
            userKey,
            teamId: props.teamId
          })
        : {
            searchQueries: [],
            reRankQuery: query,
            aiExtensionResult: undefined
          };

      const result = await searchDatasetData({
        ...props,
        userKey,
        reRankQuery,
        textQueries: searchQueries,
        // S2：同义词装饰只扫「用户原始问题」（props.textQueries 是扩展前的输入），
        // 扩展模型生成的同义词与装饰语义（原词出现在分块或用户问题中）无关。
        rawQueries: [...(props.rawQueries ?? []), ...textQueries]
      });

      return {
        ...result,
        queryExtensionResult: aiExtensionResult
          ? {
              llmModel: aiExtensionResult.llmModel,
              requestId: aiExtensionResult.requestId,
              seconds: aiExtensionResult.seconds,
              inputTokens: aiExtensionResult.inputTokens,
              outputTokens: aiExtensionResult.outputTokens,
              cacheReadTokens: aiExtensionResult.cacheReadTokens,
              cacheCreationTokens: aiExtensionResult.cacheCreationTokens,
              usedUserOpenAIKey: aiExtensionResult.usedUserOpenAIKey,
              embeddingModel: aiExtensionResult.embeddingModel,
              embeddingTokens: aiExtensionResult.embeddingTokens,
              query: searchQueries.join('\n')
            }
          : undefined
      };
    }
  );
};
