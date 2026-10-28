import { AsyncLocalStorage } from 'node:async_hooks';
import { performance } from 'node:perf_hooks';
import type { Histogram } from '@opentelemetry/api';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { getLogger, LogCategories } from '../logger';

/** 稳定的入口标识，使用规范化 HTTP 路由或 RPC 入口区分请求来源。 */
export type RequestProfileKind = string;

type StageStat = {
  n: number;
  ms: number;
  params?: Record<string, unknown>[];
};

export type ProfileStageOptions = {
  /** 稳定的阶段标识；同时用于请求汇总和指标属性。 */
  event: string;
  /** 本次调用的日志摘要；同名阶段保留各次参数，不作为指标标签。 */
  params?: Record<string, unknown>;
};

type ProfileState = {
  kind: RequestProfileKind;
  toolName?: string;
  startedAt: number;
  /** 保持阶段首次出现的顺序，输出时按执行顺序展示。 */
  stages: Map<string, StageStat>;
  mongoOps: number;
  mongoMs: number;
  mongoByCollection: Map<string, number>;
  meta: Record<string, unknown>;
  inflight: number;
  cpu: NodeJS.CpuUsage;
  elu: ReturnType<typeof performance.eventLoopUtilization>;
  ok: boolean;
  error?: string;
};

const MAX_ERROR_LENGTH = 200;
const MAX_MONGO_COLLECTIONS = 5;

const storage = new AsyncLocalStorage<ProfileState>();
const logger = getLogger(LogCategories.REQUEST.PROFILE);

/** 进程内在途的 profile 数量，用于判断调用发生时的并发水位。 */
let inflightCount = 0;

const round = (value: number) => Math.round(value * 100) / 100;

/** 标记失败并保留首条可提取的错误摘要；异常对象不可读时也不能覆盖原始业务异常。 */
const markStateError = (state: ProfileState, error?: unknown) => {
  state.ok = false;
  if (error === undefined) return;

  try {
    state.error ??= String(getErrText(error)).slice(0, MAX_ERROR_LENGTH);
  } catch {
    // 上游可能抛出非标准或带 getter 的错误对象，摘要失败只丢弃观测字段。
  }
};

/** 供其它模块低成本判断是否处于采集上下文，避免无谓的属性读取与字符串拼接。 */
export const isProfiling = () => storage.getStore() !== undefined;

/**
 * 标记当前 profile 为失败，用于业务代码已经把异常转换成响应、不再继续抛出错误的场景。
 *
 * 多次调用时保留第一个错误信息，避免响应收尾阶段的次要错误覆盖真正的业务失败原因。
 */
export const markProfileError = (error?: unknown) => {
  const state = storage.getStore();
  if (state) markStateError(state, error);
};

/**
 * 在本次调用上下文内累加一个阶段的耗时。
 *
 * 没有 profile 上下文时直接执行回调，不采集阶段参数或耗时。
 * 同名事件累计次数与耗时，params 按调用顺序保留，失败调用同样参与统计。
 */
export const profileStage = async <T>(
  { event, params }: ProfileStageOptions,
  fn: () => PromiseLike<T> | T
): Promise<T> => {
  const state = storage.getStore();
  if (!state) return fn();

  let stat = state.stages.get(event);
  if (!stat) {
    stat = { n: 0, ms: 0 };
    state.stages.set(event, stat);
  }
  if (params !== undefined) {
    stat.params ??= [];
    stat.params.push(params);
  }

  const startedAt = performance.now();
  try {
    return await fn();
  } finally {
    stat.n += 1;
    stat.ms += performance.now() - startedAt;
  }
};

/**
 * 记录一次 Mongo 操作。
 *
 * 由 `common/mongo` 的公共中间件在操作完成后调用；没有 profile 上下文时是空操作，
 * 未启用采集的请求不追加统计。
 */
export const recordMongoOperation = ({
  collectionName,
  durationMs
}: {
  collectionName?: string;
  durationMs: number;
}) => {
  const state = storage.getStore();
  if (!state) return;

  state.mongoOps += 1;
  state.mongoMs += durationMs;

  if (collectionName) {
    state.mongoByCollection.set(
      collectionName,
      (state.mongoByCollection.get(collectionName) ?? 0) + 1
    );
  }
};

/** 补挂只能在运行过程中才能确定的上下文（如 appId、节点数）。 */
export const setProfileMeta = (patch: Record<string, unknown>) => {
  const state = storage.getStore();
  if (!state) return;

  Object.assign(state.meta, patch);
};

type ProfileInstruments = {
  duration: Histogram;
  stageDuration: Histogram;
  mongoOps: Histogram;
  mongoDuration: Histogram;
};

let instrumentsPromise: Promise<ProfileInstruments> | undefined;

/**
 * 惰性创建指标仪表。
 *
 * `@opentelemetry/api` 在 MeterProvider 注册前返回的是永久 no-op meter，
 * 之后再注册 provider 也不会回填已创建的 instrument，因此不能在模块顶层获取。
 */
const getInstruments = (): Promise<ProfileInstruments> => {
  instrumentsPromise ??= (async () => {
    // 动态引入 metrics：`common/metrics` 会在模块加载时引入 `node:os`，
    // 而本模块被 `common/mongo` 静态引用。静态引入会让 os 在测试 setup 阶段就被实例化，
    // 破坏依赖 `vi.mock('node:os')` 的用例，也会让所有请求提前加载指标 SDK。
    const { getMeter } = await import('../metrics');
    const meter = getMeter('fastgpt.request.profile');

    return {
      duration: meter.createHistogram('fastgpt.request.profile.duration', {
        description: 'Request profile total duration',
        unit: 'ms'
      }),
      stageDuration: meter.createHistogram('fastgpt.request.profile.stage.duration', {
        description: 'Request profile stage duration',
        unit: 'ms'
      }),
      mongoOps: meter.createHistogram('fastgpt.request.profile.mongo.ops', {
        description: 'Mongo operations per profiled request'
      }),
      mongoDuration: meter.createHistogram('fastgpt.request.profile.mongo.duration', {
        description: 'Mongo time per profiled request',
        unit: 'ms'
      })
    };
  })();

  return instrumentsPromise;
};

const getTopCollections = (byCollection: Map<string, number>) =>
  Object.fromEntries(
    [...byCollection.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_MONGO_COLLECTIONS)
  );

const emit = async (state: ProfileState) => {
  const totalMs = round(performance.now() - state.startedAt);
  const cpu = process.cpuUsage(state.cpu);
  const elu = performance.eventLoopUtilization(state.elu);
  const stages = Object.fromEntries(
    [...state.stages.entries()].map(([event, stat]) => [
      event,
      { n: stat.n, ms: round(stat.ms), ...(stat.params ? { params: stat.params } : {}) }
    ])
  );

  const payload = {
    kind: state.kind,
    ...(state.toolName === undefined ? {} : { toolName: state.toolName }),
    ok: state.ok,
    ...(state.error === undefined ? {} : { error: state.error }),
    totalMs,
    stages,
    mongo: {
      ops: state.mongoOps,
      ms: round(state.mongoMs),
      top: getTopCollections(state.mongoByCollection)
    },
    inflight: state.inflight,
    // 进程级指标，高并发下多个请求共享，用于判断趋势而不是精确归因。
    cpuMs: round((cpu.user + cpu.system) / 1000),
    elu: round(elu.utilization * 1000) / 1000,
    ...(Object.keys(state.meta).length === 0 ? {} : { meta: state.meta })
  };

  // 埋点自身失败不能影响业务；这里只记录一条告警后放弃本次上报。
  try {
    // 转义花括号后直接拼进消息，避免日志框架把 JSON 当成占位符，也避免给字符串加引号，
    // 消息里保留一份转义后的 JSON，保证 console 输出单行、可直接 grep / jq；
    // 同时把字段作为结构化属性传给日志后端，便于按 kind / totalMs 等条件检索。
    // `verbose: false` 用于阻止 logger 代理追加 `: {*}` 占位符，避免控制台重复输出。
    const payloadText = JSON.stringify(payload).replaceAll('{', '{{').replaceAll('}', '}}');
    logger.info(`Request profile ${payloadText}`, { verbose: false, ...payload });
  } catch (error) {
    logger.warn('Failed to write request profile log', { error });
  }

  try {
    const profileInstruments = await getInstruments();
    const status = state.ok ? 'ok' : 'error';
    const baseAttributes = { kind: state.kind, status };

    profileInstruments.duration.record(totalMs, baseAttributes);
    profileInstruments.mongoOps.record(state.mongoOps, baseAttributes);
    profileInstruments.mongoDuration.record(round(state.mongoMs), baseAttributes);

    state.stages.forEach((stat, name) => {
      profileInstruments.stageDuration.record(round(stat.ms), {
        kind: state.kind,
        stage: name,
        status
      });
    });
  } catch (error) {
    logger.warn('Failed to record request profile metrics', { error });
  }
};

/**
 * 在一次调用范围内采集分段耗时与资源指标。
 *
 * - 请求入口决定是否启用；业务阶段不自行创建上下文
 * - 已存在 profile 上下文时（例如嵌套调用）直接执行，避免重复计数
 * - 无论成功或失败都会输出一次汇总日志
 */
export const withRequestProfile = async <T>(
  options: { kind: RequestProfileKind; toolName?: string },
  fn: () => Promise<T>
): Promise<T> => {
  if (isProfiling()) {
    return fn();
  }

  inflightCount += 1;

  const state: ProfileState = {
    kind: options.kind,
    toolName: options.toolName,
    startedAt: performance.now(),
    stages: new Map(),
    mongoOps: 0,
    mongoMs: 0,
    mongoByCollection: new Map(),
    meta: {},
    inflight: inflightCount,
    cpu: process.cpuUsage(),
    elu: performance.eventLoopUtilization(),
    ok: true
  };

  try {
    return await storage.run(state, fn);
  } catch (error) {
    markStateError(state, error);
    throw error;
  } finally {
    inflightCount -= 1;

    // 最后一层兜底：任何埋点异常都不能影响业务结果。
    try {
      await emit(state);
    } catch {
      // ignore
    }
  }
};
