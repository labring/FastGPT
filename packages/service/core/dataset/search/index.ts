import {
  resolveDatasetIndexScale,
  type DatasetSearchModeMetricValue,
  type VectorEngineMetricValue
} from '@fastgpt/global/common/opsPerf/constants';
import { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constants';
import { withPerfContext } from '../../../common/opsPerf/context';
import { scheduleVectorCountsForPerf } from '../../../common/opsPerf/vectorCountScheduler';
import { getVectorType } from '../../../common/vectorDB/constants';
import { getVectorCount } from '../../../common/vectorDB/controller';
import type { DefaultSearchDatasetDataProps, SearchDatasetDataResponse } from './type';
import { searchDatasetData } from './defaultRecall';
import { datasetSearchQueryExtension } from './utils';

export * from './type';

const PERF_VECTOR_COUNT_TIMEOUT_MS = 3_000;

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

  // 传入惰性配置工厂：社区版未启用商业版授权时在构造任何埋点集合/对象前即直接短路执行业务。
  return withPerfContext(
    () => {
      const uniqueDatasetIds = [...new Set((props.datasetIds ?? []).map(String))].filter(Boolean);
      const initialMode = (props.searchMode ??
        DatasetSearchModeEnum.embedding) as DatasetSearchModeMetricValue;
      const vectorEngine = (getVectorType() ?? 'unknown') as VectorEngineMetricValue;

      return {
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

          // 非 PG 或未走向量召回时，交给进程级共享并发/积压受限且支持超时退订的调度器补齐规模分桶。
          if (
            typeof state.detail.totalIndexCount !== 'number' &&
            props.teamId &&
            uniqueDatasetIds.length > 0
          ) {
            const resolved = await scheduleVectorCountsForPerf({
              teamId: props.teamId,
              datasetIds: uniqueDatasetIds,
              timeoutMs: PERF_VECTOR_COUNT_TIMEOUT_MS,
              fetchCount: ({ teamId, datasetId }) =>
                getVectorCount({ teamId, datasetId }, { notifyDatasetCounted: false })
            });
            if (resolved) {
              state.detail.totalIndexCount = resolved.totalIndexCount;
              state.detail.maxDatasetIndexCount = resolved.maxDatasetIndexCount;
              state.dims.indexScale = resolveDatasetIndexScale(resolved.totalIndexCount);
            }
          }
        }
      };
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
