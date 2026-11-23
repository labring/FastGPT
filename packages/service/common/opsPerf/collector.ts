import { addDays } from 'date-fns';
import {
  DATASET_ALL_DB_STAGE_KEYS,
  DATASET_FULLTEXT_DB_STAGE_KEYS,
  DATASET_VECTOR_DB_STAGE_KEYS,
  OPS_PERF_BUCKET_RETENTION_DAYS,
  OPS_PERF_EVENT_RETENTION_DAYS,
  OpsPerfErrorCodeValues,
  type OpsPerfDomain,
  type OpsPerfErrorCode,
  type OpsPerfEventReason,
  type OpsPerfEventStatus
} from '@fastgpt/global/common/opsPerf/constants';
import {
  addHistogramValue,
  computeIntervalUnionMs,
  type OpsPerfHistogram
} from '@fastgpt/global/common/opsPerf/histogram';
import type {
  OpsPerfDomainPayloadMap,
  OpsPerfEventStageTiming
} from '@fastgpt/global/common/opsPerf/type';
import { getLogger, LogCategories } from '../logger';
import { isProVersion } from '../system/constants';
import { Types, type AnyBulkWriteOperation } from '../mongo';
import { MongoOpsPerfBucket, MongoOpsPerfEvent } from './schema';

const logger = getLogger(LogCategories.EVENT.OPS_PERF);

const FLUSH_INTERVAL_MS = 10_000;
const MAX_BUCKET_BUFFER_SIZE = 2_000;
const MAX_EVENT_BUFFER_SIZE = 500;
const NORMAL_EVENT_SAMPLE_RATE = 0.02;
const MAX_NORMAL_SAMPLE_EVENTS_PER_WINDOW = 200;
const ALLOWED_ERROR_CODES = new Set<string>(OpsPerfErrorCodeValues);

/** 仅允许安全字段标识进入 Mongo 点路径（防止外部异常字符破坏点路径更新）。 */
const SAFE_PATH_KEY_RE = /^[a-zA-Z0-9_]+$/;

type BufferedStageAccum = {
  count: number;
  errorCount: number;
  sumMs: number;
  maxMs: number;
  hist: OpsPerfHistogram;
};

type BufferedBucketEntry = {
  domain: OpsPerfDomain;
  granularity: '1h';
  bucketTime: Date;
  expireAt: Date;
  dimKey: string;
  dims: Record<string, string | number | boolean>;
  total: {
    count: number;
    errorCount: number;
    sumMs: number;
    maxMs: number;
    hist: OpsPerfHistogram;
  };
  stages: Record<string, BufferedStageAccum>;
  metrics: Record<string, number>;
};

type BufferedEventEntry = {
  schemaVersion: 1;
  domain: OpsPerfDomain;
  createTime: Date;
  expireAt: Date;
  reason: OpsPerfEventReason;
  status: OpsPerfEventStatus;
  errorCode?: OpsPerfErrorCode;
  teamId?: Types.ObjectId;
  resourceIds: string[];
  totalMs: number;
  dims: Record<string, unknown>;
  stages: Record<string, OpsPerfEventStageTiming>;
  detail: Record<string, unknown>;
};

type OpsPerfBufferState = {
  buckets: Map<string, BufferedBucketEntry>;
  events: BufferedEventEntry[];
  normalSamplesInWindow: number;
  droppedBuckets: number;
  droppedEvents: number;
  shutdownRegistered: boolean;
  timerStarted: boolean;
  flushing: boolean;
};

// Next.js instrumentation 与 API route 可能打包在独立模块副本中，通过 globalThis Symbol 共享同一缓冲。
const BUFFER_SYMBOL = Symbol.for('fastgpt.opsPerf.buffer');

const getBufferState = (): OpsPerfBufferState => {
  const existing = Reflect.get(globalThis, BUFFER_SYMBOL) as OpsPerfBufferState | undefined;
  if (existing) return existing;

  const state: OpsPerfBufferState = {
    buckets: new Map(),
    events: [],
    normalSamplesInWindow: 0,
    droppedBuckets: 0,
    droppedEvents: 0,
    shutdownRegistered: false,
    timerStarted: false,
    flushing: false
  };
  Reflect.set(globalThis, BUFFER_SYMBOL, state);
  return state;
};

const isTestRuntime = () => Boolean(process.env.VITEST) || process.env.NODE_ENV === 'test';

/**
 * 惰性幂等启动当前进程的定时刷盘器（10 秒间隔 + 退出前兜底刷盘）。
 *
 * 这样不仅 app 进程启动时可显式注册，pro 等其他引入 @fastgpt/service 并执行检索的进程，
 * 首次产生埋点时也会自动拉起唯一刷盘定时器，避免跨进程漏注册导致内存缓冲只进不出。
 */
const ensureOpsPerfFlushTimer = () => {
  const state = getBufferState();
  if (!state.shutdownRegistered) {
    state.shutdownRegistered = true;
    const onShutdown = () => {
      void flushOpsPerfBuffer().catch(() => {});
    };
    process.once('SIGTERM', onShutdown);
    process.once('SIGINT', onShutdown);
  }

  if (state.timerStarted) return;
  state.timerStarted = true;

  const timer = setInterval(() => {
    void flushOpsPerfBuffer().catch((error) => {
      logger.error('Ops perf scheduled flush failed', { error });
    });
  }, FLUSH_INTERVAL_MS);
  // unref 确保短生命周期 CLI / 脚本进程不会被后台定时器阻塞退出
  timer.unref?.();
};

/** 对齐到 UTC 整点小时起点，保证多实例跨时区写入同一小时桶。 */
export const alignToUtcHour = (date: Date): Date => {
  const aligned = new Date(date.getTime());
  aligned.setUTCMinutes(0, 0, 0);
  return aligned;
};

/** 按 key 字典序生成确定性维度键，避免对象属性顺序差异产生重复桶。 */
export const buildOpsPerfDimKey = (dims: Record<string, unknown>): string => {
  const keys = Object.keys(dims).sort();
  return keys
    .map((key) => {
      const value = dims[key];
      const normalized =
        value === undefined || value === null ? 'unknown' : String(value).slice(0, 128);
      return `${key}=${normalized}`;
    })
    .join('|');
};

const normalizeDurationMs = (ms: number): number => {
  if (!Number.isFinite(ms) || ms < 0) return 0;
  return Math.round(ms * 100) / 100;
};

export type RecordOpsPerfInput<D extends OpsPerfDomain> = {
  domain: D;
  createTime?: Date;
  totalMs: number;
  status: OpsPerfEventStatus;
  errorCode?: OpsPerfErrorCode;
  teamId?: string;
  resourceIds?: string[];
  dims: OpsPerfDomainPayloadMap[D]['dims'];
  stages?: Partial<Record<string, OpsPerfEventStageTiming>>;
  /** 采集层保留的各阶段真实子区间列表，用于在计算复合链路并集前避免被外包区间压平。 */
  stageSpans?: Partial<Record<string, ReadonlyArray<{ start: number; end: number }>>>;
  metrics?: Partial<Record<string, number>>;
  detail?: OpsPerfDomainPayloadMap[D]['detail'];
  /** 是否允许进入单点采样队列；伴生域（rerank/queryExtension）默认 false，只写聚合桶。 */
  recordEvent?: boolean;
  /** 跳过 isProVersion 检查，仅用于单测或显式测试。 */
  force?: boolean;
  /** 仅用于单测控制采样随机数。 */
  randomValue?: number;
};

/**
 * 将单次执行的性能快照合入内存小时聚合桶，并按规则决定是否留存单点排查样本。
 *
 * - 纯内存操作，不执行任何网络或数据库 I/O，绝不阻断调用方主链路
 * - 商业版守卫：未激活商业版时直接跳过（除非显式 force）
 * - 内存有界：聚合桶上限 2000 个，单点上限 500 条，超限平滑丢弃并计告警
 */
export const enqueueOpsPerfRecord = <D extends OpsPerfDomain>(
  input: RecordOpsPerfInput<D>
): void => {
  if (!input.force && !isProVersion()) return;

  try {
    const state = getBufferState();
    // 非单测环境下首次写入自动确保当前进程（含 app / pro / worker）刷盘定时器已就绪
    if (!isTestRuntime()) {
      ensureOpsPerfFlushTimer();
    }
    const createTime = input.createTime ?? new Date();
    const bucketTime = alignToUtcHour(createTime);
    const totalMs = normalizeDurationMs(input.totalMs);
    const isError = input.status === 'error';
    const isDegraded = input.status === 'degraded';

    const dimsRecord = input.dims as Record<string, string | number | boolean>;
    const dimKey = buildOpsPerfDimKey(dimsRecord);
    const mapKey = `${input.domain}|1h|${bucketTime.getTime()}|${dimKey}`;

    // 1. 合入小时聚合桶
    let bucket = state.buckets.get(mapKey);
    if (!bucket) {
      if (state.buckets.size >= MAX_BUCKET_BUFFER_SIZE) {
        state.droppedBuckets += 1;
      } else {
        bucket = {
          domain: input.domain,
          granularity: '1h',
          bucketTime,
          expireAt: addDays(bucketTime, OPS_PERF_BUCKET_RETENTION_DAYS),
          dimKey,
          dims: { ...dimsRecord },
          total: {
            count: 0,
            errorCount: 0,
            sumMs: 0,
            maxMs: totalMs,
            hist: {}
          },
          stages: {},
          metrics: {}
        };
        state.buckets.set(mapKey, bucket);
      }
    }

    if (bucket) {
      bucket.total.count += 1;
      if (isError) bucket.total.errorCount += 1;
      bucket.total.sumMs += totalMs;
      if (totalMs > bucket.total.maxMs) bucket.total.maxMs = totalMs;
      addHistogramValue({ hist: bucket.total.hist, durationMs: totalMs });

      if (input.stages) {
        const accumulateBucketStage = (stageKey: string, stageMs: number, stageErrors: number) => {
          let stageAccum = bucket!.stages[stageKey];
          if (!stageAccum) {
            stageAccum = {
              count: 0,
              errorCount: 0,
              sumMs: 0,
              maxMs: stageMs,
              hist: {}
            };
            bucket!.stages[stageKey] = stageAccum;
          }

          stageAccum.count += 1;
          stageAccum.errorCount += stageErrors;
          stageAccum.sumMs += stageMs;
          if (stageMs > stageAccum.maxMs) stageAccum.maxMs = stageMs;
          addHistogramValue({ hist: stageAccum.hist, durationMs: stageMs });
        };

        const stagesRecord = input.stages as Record<string, OpsPerfEventStageTiming | undefined>;

        for (const [stageKey, timing] of Object.entries(stagesRecord)) {
          if (!timing || !SAFE_PATH_KEY_RE.test(stageKey)) continue;
          accumulateBucketStage(stageKey, normalizeDurationMs(timing.ms), timing.errorCount ?? 0);
        }

        if (input.domain === 'dataset.search') {
          const accumulateCompositeStage = (targetKey: string, memberKeys: readonly string[]) => {
            const intervals: Array<{ start: number; end: number }> = [];
            let hasAny = false;
            let combinedErrors = 0;
            for (const key of memberKeys) {
              const timing = stagesRecord[key];
              const rawSpans = input.stageSpans?.[key];
              if (!timing && (!rawSpans || rawSpans.length === 0)) continue;
              hasAny = true;
              if (rawSpans && rawSpans.length > 0) {
                for (const span of rawSpans) {
                  const start = normalizeDurationMs(span.start);
                  const end = Math.max(start, normalizeDurationMs(span.end));
                  intervals.push({ start, end });
                }
              } else if (timing) {
                const start = normalizeDurationMs(timing.offsetMs);
                const end = start + normalizeDurationMs(timing.ms);
                intervals.push({ start, end });
              }
              combinedErrors += timing?.errorCount ?? 0;
            }
            if (hasAny) {
              // 按成员阶段真实子区间并集结算，既排除重试空档，也去重并行阶段重叠时间。
              accumulateBucketStage(targetKey, computeIntervalUnionMs(intervals), combinedErrors);
            }
          };

          // 为向量、全文及全数据库链路各记录一条复合直方图，保证端到端耗时与分位数无偏。
          accumulateCompositeStage('vectorPipeline', DATASET_VECTOR_DB_STAGE_KEYS);
          accumulateCompositeStage('fullTextPipeline', DATASET_FULLTEXT_DB_STAGE_KEYS);
          accumulateCompositeStage('dbPipeline', DATASET_ALL_DB_STAGE_KEYS);
        }
      }

      if (input.metrics) {
        for (const [metricKey, delta] of Object.entries(input.metrics)) {
          if (
            !SAFE_PATH_KEY_RE.test(metricKey) ||
            typeof delta !== 'number' ||
            !Number.isFinite(delta) ||
            delta === 0
          ) {
            continue;
          }
          bucket.metrics[metricKey] = (bucket.metrics[metricKey] ?? 0) + delta;
        }
      }
    }

    // 2. 按留痕策略决定是否入队单点样本（报错/降级 100% 留存 + 正常请求按 2% 限速采样）
    if (input.recordEvent === false) return;

    const reason = ((): OpsPerfEventReason | undefined => {
      if (isError) return 'error';
      if (isDegraded) return 'degraded';
      const rand = input.randomValue ?? Math.random();
      if (
        rand < NORMAL_EVENT_SAMPLE_RATE &&
        state.normalSamplesInWindow < MAX_NORMAL_SAMPLE_EVENTS_PER_WINDOW
      ) {
        state.normalSamplesInWindow += 1;
        return 'sample';
      }
      return undefined;
    })();

    if (!reason) return;

    if (state.events.length >= MAX_EVENT_BUFFER_SIZE) {
      // 优先丢弃已有普通采样点，保底异常/降级样本不因正常采样爆仓而丢失
      if (reason === 'sample') {
        state.droppedEvents += 1;
        return;
      }
      const sampleIdx = state.events.findIndex((item) => item.reason === 'sample');
      if (sampleIdx !== -1) {
        state.events.splice(sampleIdx, 1);
      } else {
        state.droppedEvents += 1;
        return;
      }
    }

    const resourceIds = (input.resourceIds ?? []).filter(Boolean);
    const validTeamId =
      input.teamId && Types.ObjectId.isValid(input.teamId)
        ? new Types.ObjectId(input.teamId)
        : undefined;

    const cleanStages: Record<string, OpsPerfEventStageTiming> = {};
    if (input.stages) {
      for (const [stageKey, timing] of Object.entries(input.stages)) {
        if (!timing || !SAFE_PATH_KEY_RE.test(stageKey)) continue;
        cleanStages[stageKey] = {
          offsetMs: normalizeDurationMs(timing.offsetMs),
          ms: normalizeDurationMs(timing.ms),
          ...(timing.endOffsetMs !== undefined
            ? { endOffsetMs: normalizeDurationMs(timing.endOffsetMs) }
            : {}),
          ...(timing.callCount !== undefined ? { callCount: timing.callCount } : {}),
          ...(timing.errorCount !== undefined && timing.errorCount > 0
            ? { errorCount: timing.errorCount }
            : {})
        };
      }
    }

    const cleanDetail: Record<string, unknown> = {};
    if (input.detail) {
      for (const [k, v] of Object.entries(input.detail)) {
        if (v !== undefined && v !== null) {
          cleanDetail[k] = v;
        }
      }
    }

    const safeErrorCode =
      input.errorCode && ALLOWED_ERROR_CODES.has(input.errorCode) ? input.errorCode : undefined;

    state.events.push({
      schemaVersion: 1,
      domain: input.domain,
      createTime,
      expireAt: addDays(createTime, OPS_PERF_EVENT_RETENTION_DAYS),
      reason,
      status: input.status,
      ...(safeErrorCode ? { errorCode: safeErrorCode } : {}),
      ...(validTeamId ? { teamId: validTeamId } : {}),
      resourceIds,
      totalMs,
      dims: { ...dimsRecord },
      stages: cleanStages,
      detail: cleanDetail
    });
  } catch (error) {
    logger.warn('Failed to enqueue ops perf record', { error });
  }
};

/** 构造单个小时桶的原子 upsert bulkWrite 操作。 */
const buildBucketBulkOp = (entry: BufferedBucketEntry): AnyBulkWriteOperation<any> => {
  const inc: Record<string, number> = {
    'total.count': entry.total.count,
    'total.errorCount': entry.total.errorCount,
    'total.sumMs': entry.total.sumMs
  };
  const max: Record<string, number> = {
    'total.maxMs': entry.total.maxMs
  };

  for (const [histKey, count] of Object.entries(entry.total.hist)) {
    if (count > 0) inc[`total.hist.${histKey}`] = count;
  }

  for (const [stageKey, st] of Object.entries(entry.stages)) {
    inc[`stages.${stageKey}.count`] = st.count;
    inc[`stages.${stageKey}.errorCount`] = st.errorCount;
    inc[`stages.${stageKey}.sumMs`] = st.sumMs;
    max[`stages.${stageKey}.maxMs`] = st.maxMs;
    for (const [histKey, count] of Object.entries(st.hist)) {
      if (count > 0) inc[`stages.${stageKey}.hist.${histKey}`] = count;
    }
  }

  for (const [metricKey, delta] of Object.entries(entry.metrics)) {
    if (delta !== 0) inc[`metrics.${metricKey}`] = delta;
  }

  return {
    updateOne: {
      filter: {
        domain: entry.domain,
        granularity: entry.granularity,
        bucketTime: entry.bucketTime,
        dimKey: entry.dimKey
      },
      update: {
        $setOnInsert: {
          schemaVersion: 1,
          domain: entry.domain,
          granularity: entry.granularity,
          bucketTime: entry.bucketTime,
          expireAt: entry.expireAt,
          dimKey: entry.dimKey,
          dims: entry.dims
        },
        $inc: inc,
        $max: max
      },
      upsert: true
    }
  };
};

/** 判断 bulkWrite 错误是否由跨实例首条整点 upsert 并发唯一键冲突引起。 */
const isDuplicateKeyBulkError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;
  const errObj = error as { code?: number; writeErrors?: Array<{ code?: number }> };
  if (errObj.code === 11000) return true;
  return (
    Array.isArray(errObj.writeErrors) &&
    errObj.writeErrors.length > 0 &&
    errObj.writeErrors.every((item) => item.code === 11000)
  );
};

/**
 * 将内存缓冲的小时聚合桶和单点样本批量刷入 connectionLogMongo。
 *
 * - 先原子换出队列，确保刷盘期间新产生的检索指标不会丢失或重复计算
 * - 若多个 Pod 在新整点首次 upsert 碰撞 E11000，仅对冲突项重试一次即可安全累加
 */
export const flushOpsPerfBuffer = async (): Promise<{
  bucketsFlushed: number;
  eventsFlushed: number;
}> => {
  const state = getBufferState();
  if (state.flushing) {
    return { bucketsFlushed: 0, eventsFlushed: 0 };
  }
  if (state.buckets.size === 0 && state.events.length === 0) {
    state.normalSamplesInWindow = 0;
    return { bucketsFlushed: 0, eventsFlushed: 0 };
  }

  state.flushing = true;
  try {
    const bucketEntries = Array.from(state.buckets.values());
    const eventEntries = state.events;
    const droppedBuckets = state.droppedBuckets;
    const droppedEvents = state.droppedEvents;

    state.buckets = new Map();
    state.events = [];
    state.normalSamplesInWindow = 0;
    state.droppedBuckets = 0;
    state.droppedEvents = 0;

    if (droppedBuckets > 0 || droppedEvents > 0) {
      logger.warn('Ops perf buffer reached capacity and dropped items', {
        droppedBuckets,
        droppedEvents
      });
    }

    let bucketsFlushed = 0;
    let eventsFlushed = 0;

    if (bucketEntries.length > 0) {
      const bulkOps = bucketEntries.map(buildBucketBulkOp);
      try {
        await MongoOpsPerfBucket.bulkWrite(bulkOps, { ordered: false });
        bucketsFlushed = bulkOps.length;
      } catch (error) {
        if (isDuplicateKeyBulkError(error)) {
          // 整点首条文档并发 upsert 碰撞：重试冲突操作即可转入已有文档原子 $inc
          try {
            const writeErrors =
              (error as { writeErrors?: Array<{ index?: number }> }).writeErrors ?? [];
            const retryOps =
              writeErrors.length > 0
                ? writeErrors
                    .map((item) =>
                      typeof item.index === 'number' ? bulkOps[item.index] : undefined
                    )
                    .filter((op): op is (typeof bulkOps)[number] => op !== undefined)
                : bulkOps;
            if (retryOps.length > 0) {
              await MongoOpsPerfBucket.bulkWrite(retryOps, { ordered: false });
            }
            bucketsFlushed = bulkOps.length;
          } catch (retryError) {
            logger.error('Ops perf bucket bulkWrite retry failed', { error: retryError });
          }
        } else {
          logger.error('Ops perf bucket bulkWrite failed', { error });
        }
      }
    }

    if (eventEntries.length > 0) {
      try {
        await MongoOpsPerfEvent.insertMany(eventEntries, { ordered: false });
        eventsFlushed = eventEntries.length;
      } catch (error) {
        logger.error('Ops perf event insertMany failed', { error });
      }
    }

    if (bucketsFlushed > 0 || eventsFlushed > 0) {
      logger.debug('Ops perf buffer flushed', { bucketsFlushed, eventsFlushed });
    }

    return { bucketsFlushed, eventsFlushed };
  } finally {
    state.flushing = false;
  }
};

/** 仅用于测试重置内存缓冲与定时器状态。 */
export const resetOpsPerfBufferForTest = () => {
  const state = getBufferState();
  state.buckets = new Map();
  state.events = [];
  state.normalSamplesInWindow = 0;
  state.droppedBuckets = 0;
  state.droppedEvents = 0;
  state.flushing = false;
  state.timerStarted = false;
};

/** 仅用于测试读取当前内存缓冲快照。 */
export const getOpsPerfBufferSnapshotForTest = () => {
  const state = getBufferState();
  return {
    buckets: Array.from(state.buckets.values()),
    events: [...state.events],
    timerStarted: state.timerStarted
  };
};

/**
 * 启动运维性能缓冲定时刷新循环（每 10 秒落库一次），幂等且支持退出前尽力刷新。
 * 社区版未启用商业版授权时不注册定时器；若后续运行时授权变更启用，首次入队会自动惰性拉起。
 */
export const opsPerfTimerProcess = async () => {
  if (!isProVersion()) return;
  ensureOpsPerfFlushTimer();
  await flushOpsPerfBuffer();
};
