import { AsyncLocalStorage } from 'node:async_hooks';
import { performance } from 'node:perf_hooks';
import {
  OPS_PERF_DOMAIN_CONFIG,
  type OpsPerfDomain,
  type OpsPerfErrorCode,
  type OpsPerfEventStatus
} from '@fastgpt/global/common/opsPerf/constants';
import { computeIntervalUnionMs, mergeIntervals } from '@fastgpt/global/common/opsPerf/histogram';
import type {
  OpsPerfDomainPayloadMap,
  OpsPerfEventStageTiming
} from '@fastgpt/global/common/opsPerf/type';
import { isProVersion } from '../system/constants';
import { enqueueOpsPerfRecord, type RecordOpsPerfInput } from './collector';

const MAX_SPANS_PER_STAGE = 64;

const statusSeverityRank = (status: OpsPerfEventStatus): number => {
  if (status === 'error') return 2;
  if (status === 'degraded') return 1;
  return 0;
};

export type PerfStageSpan = { start: number; end: number };

type StageAccumulator = {
  /** 同名阶段各次真实调用的相对区间列表，用于在压平前精确计算区间并集。 */
  spans: PerfStageSpan[];
  /** 同名阶段首次开始相对 context 起点的偏移（ms）。 */
  minStartOffsetMs: number;
  /** 同名阶段最后结束相对 context 起点的偏移（ms），供瀑布图定位跨度终点。 */
  maxEndOffsetMs: number;
  callCount: number;
  errorCount: number;
};

export type PerfContextState<D extends OpsPerfDomain = OpsPerfDomain> = {
  domain: D;
  startedAtPerf: number;
  createTime: Date;
  status: OpsPerfEventStatus;
  errorCode?: OpsPerfErrorCode;
  errorCodeSeverity: OpsPerfEventStatus;
  /** 仅记录最近一次未捕获向上抛出的异常对象与所在阶段，避免静默降级或已恢复重试污染后续异常归因。 */
  lastThrownError?: unknown;
  lastThrownStage?: string;
  teamId?: string;
  resourceIds: string[];
  dims: Record<string, unknown>;
  stages: Map<string, StageAccumulator>;
  metrics: Record<string, number>;
  detail: Record<string, unknown>;
  recordEvent: boolean;
  force: boolean;
};

export type WithPerfContextOptions<D extends OpsPerfDomain, T> = {
  domain: D;
  teamId?: string;
  resourceIds?: string[];
  dims: OpsPerfDomainPayloadMap[D]['dims'];
  metrics?: Partial<Record<string, number>>;
  detail?: Partial<OpsPerfDomainPayloadMap[D]['detail']>;
  recordEvent?: boolean;
  /** 跳过 isProVersion 检查，仅用于测试。 */
  force?: boolean;
  /**
   * 业务结束后的补充回调（在 finally 阶段触发，支持异步补齐索引数等非关键维度；
   * 若返回 Promise，会脱离主链路在后台结算入队，不阻塞业务返回）。
   */
  onFinalize?: (params: {
    state: PerfContextState<D>;
    result?: T;
    error?: unknown;
    totalMs: number;
    stages: Record<string, OpsPerfEventStageTiming>;
  }) => void | Promise<void>;
};

type DomainContextMap = Map<OpsPerfDomain, PerfContextState>;

// 跨 Next.js bundle 共享同一 AsyncLocalStorage 实例，避免不同 chunk 间丢上下文。
const ALS_SYMBOL = Symbol.for('fastgpt.opsPerf.als');

const getContextStorage = (): AsyncLocalStorage<DomainContextMap> => {
  const existing = Reflect.get(globalThis, ALS_SYMBOL) as
    | AsyncLocalStorage<DomainContextMap>
    | undefined;
  if (existing) return existing;

  const storage = new AsyncLocalStorage<DomainContextMap>();
  Reflect.set(globalThis, ALS_SYMBOL, storage);
  return storage;
};

const getDomainState = <D extends OpsPerfDomain>(domain: D): PerfContextState<D> | undefined => {
  const map = getContextStorage().getStore();
  return map?.get(domain) as PerfContextState<D> | undefined;
};

/** 判断指定性能域是否存在活跃埋点上下文（O(1) ALS 查找，供深层调用点跳过无关计算）。 */
export const hasPerfContext = (domain: OpsPerfDomain): boolean => Boolean(getDomainState(domain));

/** 判断运维性能埋点是否应对当前调用生效（商业版默认开启，或处于显式创建的活跃上下文内）。 */
export const isOpsPerfActive = (domain?: OpsPerfDomain): boolean =>
  isProVersion() || (domain ? hasPerfContext(domain) : false);

/** 记录向上抛出的阶段异常（嵌套阶段下保留最内层首次抛出阶段，避免外层覆写）。 */
const recordThrownStage = (state: PerfContextState, stage: string, error: unknown) => {
  if (state.lastThrownStage && Object.is(state.lastThrownError, error)) return;
  state.lastThrownError = error;
  state.lastThrownStage = stage;
};

/** 将一次阶段调用区间写入累计器；超过上限时先压缩重叠区间防止极端循环膨胀内存。 */
const appendStageSpan = ({
  state,
  stage,
  startOffset,
  endOffset,
  failed
}: {
  state: PerfContextState;
  stage: string;
  startOffset: number;
  endOffset: number;
  failed: boolean;
}) => {
  const span: PerfStageSpan = { start: startOffset, end: Math.max(startOffset, endOffset) };
  const existing = state.stages.get(stage);
  if (!existing) {
    state.stages.set(stage, {
      spans: [span],
      minStartOffsetMs: span.start,
      maxEndOffsetMs: span.end,
      callCount: 1,
      errorCount: failed ? 1 : 0
    });
    return;
  }

  if (existing.spans.length >= MAX_SPANS_PER_STAGE) {
    // 复用公共区间合并原语压缩重叠/相邻区间，保留真实空档；仍超限时并入末尾确保内存有界。
    const merged = mergeIntervals([...existing.spans, span]);
    if (merged.length > MAX_SPANS_PER_STAGE) {
      const last = merged[merged.length - 1]!;
      const tail = merged[MAX_SPANS_PER_STAGE - 1]!;
      tail.end = Math.max(tail.end, last.end);
      merged.length = MAX_SPANS_PER_STAGE;
    }
    existing.spans = merged;
  } else {
    existing.spans.push(span);
  }

  existing.minStartOffsetMs = Math.min(existing.minStartOffsetMs, span.start);
  existing.maxEndOffsetMs = Math.max(existing.maxEndOffsetMs, span.end);
  existing.callCount += 1;
  if (failed) existing.errorCount += 1;
};

const buildStageSnapshot = (
  stages: Map<string, StageAccumulator>
): {
  stages: Record<string, OpsPerfEventStageTiming>;
  stageSpans: Record<string, PerfStageSpan[]>;
} => {
  const result: Record<string, OpsPerfEventStageTiming> = {};
  const stageSpans: Record<string, PerfStageSpan[]> = {};
  stages.forEach((acc, key) => {
    const offsetMs = Math.max(0, Math.round(acc.minStartOffsetMs * 100) / 100);
    const endOffsetMs = Math.max(offsetMs, Math.round(acc.maxEndOffsetMs * 100) / 100);
    const ms = computeIntervalUnionMs(acc.spans);
    result[key] = {
      offsetMs,
      ms,
      ...(endOffsetMs > offsetMs + ms + 0.5 ? { endOffsetMs } : {}),
      callCount: acc.callCount,
      ...(acc.errorCount > 0 ? { errorCount: acc.errorCount } : {})
    };
    stageSpans[key] = acc.spans;
  });
  return { stages: result, stageSpans };
};

/**
 * 为指定 domain 创建隔离的性能埋点上下文；结束时自动结算总耗时并入队缓冲。
 *
 * - 支持传入惰性配置工厂函数：社区版在构造 dims/detail 之前即零开销短路
 * - 支持多 domain 嵌套（如未来 workflow.run 嵌套 dataset.search），互不覆盖
 * - 同 domain 重入时直接透传外层上下文，避免重复记账
 */
export const withPerfContext = async <D extends OpsPerfDomain, T>(
  optionsOrFactory: WithPerfContextOptions<D, T> | (() => WithPerfContextOptions<D, T>),
  fn: () => Promise<T>
): Promise<T> => {
  if (typeof optionsOrFactory === 'function' && !isProVersion()) {
    return fn();
  }
  const options = typeof optionsOrFactory === 'function' ? optionsOrFactory() : optionsOrFactory;
  if (!options.force && !isProVersion()) {
    return fn();
  }

  const storage = getContextStorage();
  const parentMap = storage.getStore();
  if (parentMap?.has(options.domain)) {
    return fn();
  }

  const state: PerfContextState<D> = {
    domain: options.domain,
    startedAtPerf: performance.now(),
    createTime: new Date(),
    status: 'ok',
    errorCodeSeverity: 'ok',
    teamId: options.teamId,
    resourceIds: [...(options.resourceIds ?? [])],
    dims: { ...(options.dims as Record<string, unknown>) },
    stages: new Map(),
    metrics: { ...(options.metrics ?? {}) } as Record<string, number>,
    detail: { ...(options.detail ?? {}) } as Record<string, unknown>,
    recordEvent: options.recordEvent ?? true,
    force: options.force ?? false
  };

  const nextMap: DomainContextMap = new Map(parentMap ?? []);
  nextMap.set(options.domain, state);

  let resultValue: T | undefined;
  let caughtError: unknown;
  let hasError = false;

  try {
    resultValue = await storage.run(nextMap, fn);
    return resultValue;
  } catch (error) {
    hasError = true;
    caughtError = error;
    state.status = 'error';
    // 严格脱敏且按严重级别升级归因：仅当捕获对象与阶段抛出的异常一致时归因到该阶段，否则落到域默认错误码。
    if (!state.errorCode || state.errorCodeSeverity !== 'error') {
      const domainConfig = OPS_PERF_DOMAIN_CONFIG[state.domain];
      const matchedStage =
        state.lastThrownStage && Object.is(state.lastThrownError, error)
          ? state.lastThrownStage
          : undefined;
      state.errorCode =
        (matchedStage ? domainConfig?.stageErrorCodes?.[matchedStage] : undefined) ??
        domainConfig?.defaultErrorCode;
      state.errorCodeSeverity = 'error';
    }
    throw error;
  } finally {
    const totalMs = Math.max(0, performance.now() - state.startedAtPerf);
    const { stages: stagesSnapshot, stageSpans } = buildStageSnapshot(state.stages);

    const commit = () => {
      enqueueOpsPerfRecord({
        domain: state.domain,
        createTime: state.createTime,
        totalMs,
        status: state.status,
        errorCode: state.errorCode,
        teamId: state.teamId,
        resourceIds: state.resourceIds,
        dims: state.dims as OpsPerfDomainPayloadMap[D]['dims'],
        stages: stagesSnapshot,
        stageSpans,
        metrics: state.metrics,
        detail: state.detail as OpsPerfDomainPayloadMap[D]['detail'],
        recordEvent: state.recordEvent,
        force: state.force
      });
    };

    if (options.onFinalize) {
      try {
        const maybePromise = options.onFinalize({
          state,
          result: hasError ? undefined : resultValue,
          error: hasError ? caughtError : undefined,
          totalMs,
          stages: stagesSnapshot
        });
        if (maybePromise && typeof (maybePromise as Promise<void>).then === 'function') {
          void (maybePromise as Promise<void>)
            .catch(() => {})
            .finally(() => {
              commit();
            });
        } else {
          commit();
        }
      } catch {
        commit();
      }
    } else {
      commit();
    }
  }
};

/**
 * 追踪当前 domain 上下文中的单个执行阶段耗时。
 *
 * - 无活跃上下文时零成本直接执行 `fn()`
 * - 同名阶段在并发（如多 query Promise.all）下按 [minStart, maxEnd] 合并区间，
 *   防止并行阶段耗时被重复叠加导致瀑布图超过总耗时
 * - 业务发生静默回退（内部 catch 后降级返回）时，可调用回调入参 `markError()` 准确累计阶段异常数
 */
export const trackPerfStage = async <D extends OpsPerfDomain, T>(
  options: {
    domain: D;
    stage: keyof OpsPerfDomainPayloadMap[D]['stages'] & string;
  },
  fn: (controls: { markError: () => void }) => Promise<T> | T
): Promise<T> => {
  const state = getDomainState(options.domain);
  if (!state) return fn({ markError: () => {} });

  const startOffset = Math.max(0, performance.now() - state.startedAtPerf);
  let failed = false;
  const markError = () => {
    // 静默降级只累计本阶段 errorCount，不写入 lastThrownStage，避免污染后续未捕获异常归因。
    failed = true;
  };

  try {
    return await fn({ markError });
  } catch (error) {
    failed = true;
    recordThrownStage(state, options.stage, error);
    throw error;
  } finally {
    const endOffset = Math.max(startOffset, performance.now() - state.startedAtPerf);
    appendStageSpan({ state, stage: options.stage, startOffset, endOffset, failed });
  }
};

/**
 * 在深层调用点手动记录一段已知起止时间的阶段耗时（适用于无法直接包裹的分支或并发回调内部）。
 */
export const recordPerfStageSpan = <D extends OpsPerfDomain>(options: {
  domain: D;
  stage: keyof OpsPerfDomainPayloadMap[D]['stages'] & string;
  startedAtPerf: number;
  endedAtPerf?: number;
  failed?: boolean;
  /** 若该阶段失败并准备继续向上抛出该异常，传入原异常对象用于精确归因。 */
  error?: unknown;
}) => {
  const state = getDomainState(options.domain);
  if (!state) return;

  if (options.failed && options.error !== undefined) {
    recordThrownStage(state, options.stage, options.error);
  }
  const startOffset = Math.max(0, options.startedAtPerf - state.startedAtPerf);
  const endOffset = Math.max(
    startOffset,
    (options.endedAtPerf ?? performance.now()) - state.startedAtPerf
  );
  appendStageSpan({
    state,
    stage: options.stage,
    startOffset,
    endOffset,
    failed: Boolean(options.failed)
  });
};

/**
 * 在深层调用点向当前 domain 上下文增量补挂维度、指标、诊断详情或状态。
 * 无上下文时为静默空操作；`metrics` 采用累加语义，其余字段采用浅合并。
 */
export const patchPerfContext = <D extends OpsPerfDomain>(options: {
  domain: D;
  dims?: Partial<OpsPerfDomainPayloadMap[D]['dims']>;
  metrics?: Partial<Record<keyof OpsPerfDomainPayloadMap[D]['metrics'] & string, number>>;
  detail?: Partial<OpsPerfDomainPayloadMap[D]['detail']>;
  status?: OpsPerfEventStatus;
  errorCode?: OpsPerfErrorCode;
  teamId?: string;
  resourceIds?: string[];
}) => {
  const state = getDomainState(options.domain);
  if (!state) return;

  if (options.dims) {
    Object.assign(state.dims, options.dims);
  }
  if (options.detail) {
    Object.assign(state.detail, options.detail);
  }
  if (options.metrics) {
    for (const [key, delta] of Object.entries(options.metrics)) {
      if (typeof delta === 'number' && Number.isFinite(delta)) {
        state.metrics[key] = (state.metrics[key] ?? 0) + delta;
      }
    }
  }
  if (options.status) {
    // 严重级别单调升级：error > degraded > ok
    if (statusSeverityRank(options.status) > statusSeverityRank(state.status)) {
      state.status = options.status;
    }
  }
  if (options.errorCode) {
    const incomingSeverity = options.status ?? state.status;
    if (
      !state.errorCode ||
      statusSeverityRank(incomingSeverity) > statusSeverityRank(state.errorCodeSeverity)
    ) {
      state.errorCode = options.errorCode;
      state.errorCodeSeverity = incomingSeverity;
    }
  }
  if (options.teamId) {
    state.teamId = options.teamId;
  }
  if (options.resourceIds) {
    state.resourceIds = [...options.resourceIds];
  }
};

/**
 * 直接上报一次独立域的性能度量（如伴生域 dataset.rerank / dataset.queryExtension），
 * 不依赖外层上下文，默认仅入小时聚合桶（不重复写单点）。
 */
export const recordPerfPoint = <D extends OpsPerfDomain>(
  input: Omit<RecordOpsPerfInput<D>, 'recordEvent'> & { recordEvent?: boolean }
) => {
  enqueueOpsPerfRecord({
    ...input,
    recordEvent: input.recordEvent ?? false
  });
};
