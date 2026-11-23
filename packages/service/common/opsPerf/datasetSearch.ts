import { performance } from 'node:perf_hooks';
import {
  isRedisLeaseError,
  RedisLeaseLostError,
  RedisLeaseWaitTimeoutError,
  type RedisLeaseContext
} from '@fastgpt/dal/redis/caches/lease';
import {
  resolveDatasetIndexScale,
  type DatasetSearchModeMetricValue,
  type DatasetSearchStageKey,
  type OpsPerfErrorCode,
  type VectorEngineMetricValue
} from '@fastgpt/global/common/opsPerf/constants';
import { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constants';
import { getVectorType } from '../vectorDB/constants';
import {
  hasPerfContext,
  isOpsPerfActive,
  patchPerfContext,
  recordPerfPoint,
  recordPerfStageSpan,
  tagPerfError,
  trackPerfStage,
  withPerfContext
} from './context';
import { scheduleVectorCountsForPerf } from './vectorCountScheduler';

const PERF_VECTOR_COUNT_TIMEOUT_MS = 3_000;

type ModelLabelRef = { model?: string; name?: string } | undefined;

const resolveModelLabel = (ref: ModelLabelRef): string | undefined => ref?.model || ref?.name;

type DatasetSearchPerfResultShape = {
  searchMode: string;
  usingReRank: boolean;
  searchRes: unknown[];
  embeddingTokens: number;
  reRankInputTokens: number;
  queryExtensionResult?: unknown;
};

/**
 * 知识库搜索统一入口的运维性能埋点包装器。
 *
 * 将初始维度构造、结束结算（PG 路由计数、token/结果数）与冷缓存索引数补齐全部收口在此，
 * 业务入口 `defaultSearchDatasetData` 保持零埋点编排细节，社区版在构造任何对象前直接短路。
 */
export const withDatasetSearchPerf = <T extends DatasetSearchPerfResultShape>(
  params: {
    teamId?: string;
    datasetIds?: string[];
    textQueries: string[];
    queryChars: number;
    imageQueryCount: number;
    searchMode?: string;
    usingReRank?: boolean;
    usingExtension?: boolean;
    embeddingModel?: ModelLabelRef;
    rerankModel?: ModelLabelRef;
    extensionModel?: ModelLabelRef;
    fetchVectorCount: (input: { teamId: string; datasetId: string }) => Promise<number>;
  },
  fn: () => Promise<T>
): Promise<T> =>
  withPerfContext(() => {
    const uniqueDatasetIds = [...new Set((params.datasetIds ?? []).map(String))].filter(Boolean);
    const initialMode = (params.searchMode ??
      DatasetSearchModeEnum.embedding) as DatasetSearchModeMetricValue;
    const vectorEngine = (getVectorType() ?? 'unknown') as VectorEngineMetricValue;

    return {
      domain: 'dataset.search',
      teamId: params.teamId,
      resourceIds: uniqueDatasetIds,
      dims: {
        searchMode: initialMode,
        indexScale: 'unknown',
        usingReRank: Boolean(params.usingReRank && params.rerankModel),
        usingExtension: Boolean(params.usingExtension && params.extensionModel),
        vectorEngine
      },
      metrics: {
        totalDatasetCount: uniqueDatasetIds.length
      },
      detail: {
        datasetCount: uniqueDatasetIds.length,
        queryCount: params.textQueries.length,
        queryChars: params.queryChars,
        imageQueryCount: params.imageQueryCount,
        embeddingModel: resolveModelLabel(params.embeddingModel),
        rerankModel: resolveModelLabel(params.rerankModel),
        extensionModel: resolveModelLabel(params.extensionModel)
      },
      onFinalize: async ({ state, result }) => {
        if (result) {
          state.dims.searchMode = result.searchMode as DatasetSearchModeMetricValue;
          state.dims.usingReRank = Boolean(
            result.usingReRank || state.detail.rerankFallback === true
          );
          state.dims.usingExtension = Boolean(
            result.queryExtensionResult || (params.usingExtension && params.extensionModel)
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
          params.teamId &&
          uniqueDatasetIds.length > 0
        ) {
          const resolved = await scheduleVectorCountsForPerf({
            teamId: params.teamId,
            datasetIds: uniqueDatasetIds,
            timeoutMs: PERF_VECTOR_COUNT_TIMEOUT_MS,
            fetchCount: params.fetchVectorCount
          });
          if (resolved) {
            state.detail.totalIndexCount = resolved.totalIndexCount;
            state.detail.maxDatasetIndexCount = resolved.maxDatasetIndexCount;
            state.dims.indexScale = resolveDatasetIndexScale(resolved.totalIndexCount);
          }
        }
      }
    };
  }, fn);

/** 追踪 `dataset.search` 单个执行阶段耗时；无活跃上下文时零开销直通执行。 */
export const trackDatasetSearchStage = <T>(
  stage: DatasetSearchStageKey,
  fn: () => Promise<T> | T
): Promise<T> => trackPerfStage({ domain: 'dataset.search', stage }, () => fn());

/** 记录集合过滤阶段诊断特征（元数据过滤 / 权限过滤 / 集合数）。 */
export const recordDatasetSearchFilterPerf = (detail: {
  hasMetadataFilter: boolean;
  hasPermissionFilter: boolean;
  filterCollectionCount?: number;
  forbidCollectionCount: number;
}) => {
  patchPerfContext({
    domain: 'dataset.search',
    detail
  });
};

/** 记录向量路由快照汇总的索引规模与 HNSW 搜索宽度，无活跃上下文时跳过汇总计算。 */
export const recordDatasetVectorRoutePerf = ({
  datasetVectorData,
  hnswEfSearch
}: {
  datasetVectorData?: ReadonlyArray<{ rows?: number | null }> | null;
  hnswEfSearch: number;
}) => {
  if (!hasPerfContext('dataset.search')) return;
  if (datasetVectorData && datasetVectorData.length > 0) {
    const totalIndexCount = datasetVectorData.reduce((sum, item) => sum + (item.rows ?? 0), 0);
    const maxDatasetIndexCount = datasetVectorData.reduce(
      (max, item) => Math.max(max, item.rows ?? 0),
      0
    );
    patchPerfContext({
      domain: 'dataset.search',
      dims: {
        indexScale: resolveDatasetIndexScale(totalIndexCount)
      },
      detail: {
        totalIndexCount,
        maxDatasetIndexCount,
        hnswEfSearch
      }
    });
    return;
  }
  patchPerfContext({
    domain: 'dataset.search',
    detail: { hnswEfSearch }
  });
};

/** 记录 PG 向量召回命中 HNSW 或精确扫描的路由详情。 */
export const recordDatasetPgRoutePerf = ({
  usesHnsw,
  maxScanTuples
}: {
  usesHnsw: boolean;
  maxScanTuples: number;
}) => {
  patchPerfContext({
    domain: 'dataset.search',
    detail: {
      pgUsesHnsw: usesHnsw,
      pgMaxRows: maxScanTuples
    }
  });
};

/** 记录去重后的候选分块数。 */
export const recordDatasetSearchCandidateCount = (candidateCount: number) => {
  patchPerfContext({
    domain: 'dataset.search',
    detail: { candidateCount }
  });
};

/** 记录问题优化扩展后的实际检索词数量。 */
export const recordDatasetSearchQueryCount = (queryCount: number) => {
  patchPerfContext({
    domain: 'dataset.search',
    detail: { queryCount }
  });
};

const resolveVectorLeaseErrorCode = (error: unknown): OpsPerfErrorCode => {
  if (error instanceof RedisLeaseWaitTimeoutError) return 'VECTOR_LEASE_TIMEOUT';
  if (error instanceof RedisLeaseLostError) return 'VECTOR_LEASE_LOST';
  return 'VECTOR_LEASE_ACQUIRE_ERROR';
};

/**
 * 包裹一次带 Redis 并发租约的向量召回，按租约生命周期精确分离排队耗时与执行耗时：
 * - 未进入 provider 前失败：记 1 次失败的 `vectorLeaseWait`，区分超时与获取失败错误码
 * - 进入 provider 后执行期失租：保留干净的 `vectorLeaseWait`，将失败记入 `vectorRecall` 与 `VECTOR_LEASE_LOST`
 * - 任何 Redis Lease 协调异常返回 `{ success: false, error }` 供外层 `retryFn` 立即中止重试
 */
export const trackVectorRecallLease = async <T>({
  runWithLease,
  runRecall
}: {
  runWithLease: (fn: (leaseContext?: RedisLeaseContext) => Promise<T>) => Promise<T>;
  runRecall: () => Promise<T>;
}): Promise<{ success: true; value: T } | { success: false; error: unknown }> => {
  const perfActive = hasPerfContext('dataset.search');
  const leaseEnqueueAt = perfActive ? performance.now() : 0;
  let leaseAcquired = false;
  let recallStartedAt = 0;
  let recallMarkedFailed = false;

  try {
    return {
      success: true,
      value: await runWithLease(async (leaseContext) => {
        leaseAcquired = true;
        if (perfActive) {
          recordPerfStageSpan({
            domain: 'dataset.search',
            stage: 'vectorLeaseWait',
            startedAtPerf: leaseEnqueueAt
          });
          recallStartedAt = performance.now();
        }
        return trackPerfStage({ domain: 'dataset.search', stage: 'vectorRecall' }, async () => {
          try {
            const res = await runRecall();
            // 在 vectorRecall 阶段内校验租约仍有效，避免执行期续租失败被误记到 vectorLeaseWait
            leaseContext?.assertValid?.();
            return res;
          } catch (err) {
            recallMarkedFailed = true;
            if (perfActive && isRedisLeaseError(err)) {
              // 按异常身份绑定细粒度失租错误码，避免 trackPerfStage 覆写为通用 VECTOR_RECALL_ERROR，
              // 且不中途改写请求级 errorCode，保证并行分支各自报错互不干扰。
              tagPerfError('dataset.search', err, resolveVectorLeaseErrorCode(err));
            }
            throw err;
          }
        });
      })
    };
  } catch (error) {
    if (isRedisLeaseError(error)) {
      if (perfActive) {
        const errorCode = resolveVectorLeaseErrorCode(error);
        if (!leaseAcquired) {
          recordPerfStageSpan({
            domain: 'dataset.search',
            stage: 'vectorLeaseWait',
            startedAtPerf: leaseEnqueueAt,
            failed: true,
            error,
            errorCode
          });
        } else if (!recallMarkedFailed && recallStartedAt > 0) {
          recordPerfStageSpan({
            domain: 'dataset.search',
            stage: 'vectorRecall',
            startedAtPerf: recallStartedAt,
            failed: true,
            error,
            errorCode
          });
        } else {
          tagPerfError('dataset.search', error, errorCode);
        }
      }
      return { success: false, error };
    }
    throw error;
  }
};

type QueryExtensionPerfResultShape = {
  extensionQueries: string[];
  inputTokens: number;
  outputTokens: number;
  embeddingTokens: number;
};

/**
 * 包裹独立 AI 问题优化调用，根据抛出异常或返回空扩展集自动上报 `dataset.queryExtension` 伴生域，
 * 无需在 `queryExtension` 内部各提前返回分支散落埋点。
 */
export const trackQueryExtensionPerf = async <T extends QueryExtensionPerfResultShape>(
  params: {
    teamId: string;
    model: ModelLabelRef;
  },
  fn: () => Promise<T>
): Promise<T> => {
  if (!isOpsPerfActive('dataset.search')) return fn();

  const perfStart = performance.now();
  const modelLabel = resolveModelLabel(params.model) || 'unknown';
  const report = (
    status: 'ok' | 'degraded' | 'error',
    stats?: {
      invalidJson?: boolean;
      inputTokens?: number;
      outputTokens?: number;
      embeddingTokens?: number;
      generatedCount?: number;
    }
  ) => {
    recordPerfPoint({
      domain: 'dataset.queryExtension',
      teamId: params.teamId,
      totalMs: Math.max(0, performance.now() - perfStart),
      status,
      dims: { model: modelLabel },
      metrics: {
        ...(stats?.invalidJson ? { invalidJsonCount: 1 } : {}),
        totalInputTokens: stats?.inputTokens ?? 0,
        totalOutputTokens: stats?.outputTokens ?? 0,
        totalEmbeddingTokens: stats?.embeddingTokens ?? 0,
        totalGeneratedQueries: stats?.generatedCount ?? 0
      }
    });
    patchPerfContext({
      domain: 'dataset.search',
      detail: { extensionModel: modelLabel }
    });
  };

  try {
    const result = await fn();
    if (result.extensionQueries.length === 0) {
      report('degraded', {
        invalidJson: true,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        embeddingTokens: result.embeddingTokens,
        generatedCount: 0
      });
    } else {
      report('ok', {
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        embeddingTokens: result.embeddingTokens,
        generatedCount: result.extensionQueries.length
      });
    }
    return result;
  } catch (error) {
    report('error');
    throw error;
  }
};

/**
 * 追踪 `dataset.search` 中的 `queryExtension` 阶段；
 * 自动将空扩展结果与异常捕获归类为静默降级（保留原始检索词主链路不受影响）。
 */
export const trackDatasetQueryExtensionStage = <
  T extends { extensionQueries?: string[] } | undefined
>(
  fn: () => Promise<T>,
  onError?: (error: unknown) => void
): Promise<T | undefined> =>
  trackPerfStage({ domain: 'dataset.search', stage: 'queryExtension' }, async ({ markError }) => {
    const markFallback = (code: 'QUERY_EXTENSION_FALLBACK' | 'QUERY_EXTENSION_ERROR') => {
      markError();
      patchPerfContext({
        domain: 'dataset.search',
        status: 'degraded',
        errorCode: code
      });
    };

    try {
      const result = await fn();
      if (result && result.extensionQueries?.length === 0) {
        markFallback('QUERY_EXTENSION_FALLBACK');
        return undefined;
      }
      return result;
    } catch (error) {
      markFallback('QUERY_EXTENSION_ERROR');
      onError?.(error);
      return undefined;
    }
  });

/**
 * 追踪知识库搜索 Rerank 阶段并同步上报 `dataset.rerank` 伴生域指标，
 * 统一处理基线重排异常降级与同义词次路重排降级标记。
 */
export const trackDatasetRerankPerf = <T>(
  params: {
    teamId: string;
    model: ModelLabelRef;
    candidateCount: number;
  },
  fn: (controls: {
    onSynonymRerankResult?: (result: { triggered: boolean; failed: boolean }) => void;
    recordResult: (input: { inputTokens: number }) => void;
    recordFallback: () => void;
  }) => Promise<T>
): Promise<T> => {
  const perfEnabled = isOpsPerfActive('dataset.search');
  if (!perfEnabled) {
    const noop = () => {};
    return fn({ recordResult: noop, recordFallback: noop });
  }

  const rerankModelLabel = resolveModelLabel(params.model) || 'unknown';
  const rerankStart = performance.now();
  let hasSynonym = false;
  let synonymFailed = false;

  return trackPerfStage({ domain: 'dataset.search', stage: 'rerank' }, ({ markError }) => {
    const report = ({
      fallbackCode,
      inputTokens
    }: {
      fallbackCode?: 'RERANK_FALLBACK' | 'SYNONYM_RERANK_FALLBACK';
      inputTokens?: number;
    }) => {
      const isDegraded = Boolean(fallbackCode);
      if (fallbackCode) {
        markError();
        patchPerfContext({
          domain: 'dataset.search',
          status: 'degraded',
          errorCode: fallbackCode,
          metrics: { rerankFallbackCount: 1 },
          detail: { rerankFallback: true, rerankModel: rerankModelLabel }
        });
      }
      recordPerfPoint({
        domain: 'dataset.rerank',
        teamId: params.teamId,
        totalMs: Math.max(0, performance.now() - rerankStart),
        status: isDegraded ? 'degraded' : 'ok',
        dims: {
          model: rerankModelLabel,
          hasSynonym
        },
        metrics: {
          ...(isDegraded ? { fallbackCount: 1 } : {}),
          totalCandidates: params.candidateCount,
          ...(inputTokens !== undefined ? { totalInputTokens: inputTokens } : {})
        }
      });
    };

    return fn({
      onSynonymRerankResult: ({ triggered, failed }) => {
        if (triggered) {
          hasSynonym = true;
          patchPerfContext({
            domain: 'dataset.search',
            detail: { synonymRerankTriggered: true }
          });
        }
        if (failed) {
          synonymFailed = true;
        }
      },
      recordResult: ({ inputTokens }) => {
        report({
          fallbackCode: synonymFailed ? 'SYNONYM_RERANK_FALLBACK' : undefined,
          inputTokens
        });
      },
      recordFallback: () => {
        report({ fallbackCode: 'RERANK_FALLBACK' });
      }
    });
  });
};
