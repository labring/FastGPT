import { AsyncLocalStorage } from 'node:async_hooks';
import { performance } from 'node:perf_hooks';
import type { Histogram } from '@opentelemetry/api';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { serviceEnv } from '../../env';
import { getLogger, LogCategories } from '../logger';
import { getMeter } from '../metrics';

export type RequestProfileKind = 'tools/list' | 'tools/call';

type StageStat = {
  n: number;
  ms: number;
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
const logger = getLogger(LogCategories.MODULE.MCP.PROFILE);

/** 进程内在途的 profile 数量，用于判断调用发生时的并发水位。 */
let inflightCount = 0;

const round = (value: number) => Math.round(value * 100) / 100;

/**
 * 采集开关。
 *
 * 每次调用读取一次 `serviceEnv`，便于测试与灰度切换；关闭或采样未命中时
 * 不创建 AsyncLocalStorage 上下文，调用方只剩一次属性访问的开销。
 */
const shouldProfile = () => {
  if (!serviceEnv.MCP_CALL_PROFILE_ENABLE) return false;

  const sampleRate = serviceEnv.MCP_CALL_PROFILE_SAMPLE_RATE;
  if (sampleRate >= 1) return true;
  if (sampleRate <= 0) return false;

  return Math.random() < sampleRate;
};

/** 供其它模块低成本判断是否处于采集上下文，避免无谓的属性读取与字符串拼接。 */
export const isProfiling = () => storage.getStore() !== undefined;

/**
 * 在本次调用上下文内累加一个阶段的耗时。
 *
 * 没有 profile 上下文时直接执行回调，不做任何计时，保证默认关闭时几乎零开销。
 */
export const profileStage = async <T>(name: string, fn: () => PromiseLike<T> | T): Promise<T> => {
  const state = storage.getStore();
  if (!state) return fn();

  const startedAt = performance.now();
  try {
    return await fn();
  } finally {
    const stat = state.stages.get(name);
    const cost = performance.now() - startedAt;

    if (stat) {
      stat.n += 1;
      stat.ms += cost;
    } else {
      state.stages.set(name, { n: 1, ms: cost });
    }
  }
};

/**
 * 记录一次 Mongo 操作。
 *
 * 由 `common/mongo` 的公共中间件在操作完成后调用；没有 profile 上下文时是空操作，
 * 因此不会对非 MCP 请求产生可见影响。
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

let instruments: ProfileInstruments | undefined;

/**
 * 惰性创建指标仪表。
 *
 * `@opentelemetry/api` 在 MeterProvider 注册前返回的是永久 no-op meter，
 * 之后再注册 provider 也不会回填已创建的 instrument，因此不能在模块顶层获取。
 */
const getInstruments = (): ProfileInstruments => {
  if (instruments) return instruments;

  const meter = getMeter('fastgpt.request.profile');
  instruments = {
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

  return instruments;
};

const getTopCollections = (byCollection: Map<string, number>) =>
  Object.fromEntries(
    [...byCollection.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_MONGO_COLLECTIONS)
  );

const emit = (state: ProfileState) => {
  const totalMs = round(performance.now() - state.startedAt);
  const cpu = process.cpuUsage(state.cpu);
  const elu = performance.eventLoopUtilization(state.elu);
  const stages = Object.fromEntries(
    [...state.stages.entries()].map(([name, stat]) => [name, { n: stat.n, ms: round(stat.ms) }])
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
    // 保证输出是单行、可直接 grep / jq 的原始 JSON。
    const payloadText = JSON.stringify(payload).replaceAll('{', '{{').replaceAll('}', '}}');
    logger.info(`MCP call profile ${payloadText}`);
  } catch (error) {
    logger.warn('Failed to write request profile log', { error });
  }

  try {
    const profileInstruments = getInstruments();
    const status = state.ok ? 'ok' : 'error';
    const baseAttributes = { kind: state.kind, status };

    profileInstruments.duration.record(totalMs, baseAttributes);
    profileInstruments.mongoOps.record(state.mongoOps, baseAttributes);
    profileInstruments.mongoDuration.record(round(state.mongoMs), baseAttributes);

    state.stages.forEach((stat, name) => {
      profileInstruments.stageDuration.record(round(stat.ms), {
        kind: state.kind,
        stage: name
      });
    });
  } catch (error) {
    logger.warn('Failed to record request profile metrics', { error });
  }
};

/**
 * 在一次调用范围内采集分段耗时与资源指标。
 *
 * - 开关关闭或采样未命中时直接执行回调，不创建上下文
 * - 已存在 profile 上下文时（例如嵌套调用）直接执行，避免重复计数
 * - 无论成功或失败都会输出一次汇总日志
 */
export const withRequestProfile = async <T>(
  options: { kind: RequestProfileKind; toolName?: string },
  fn: () => Promise<T>
): Promise<T> => {
  if (!shouldProfile() || isProfiling()) {
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
    state.ok = false;
    state.error = getErrText(error).slice(0, MAX_ERROR_LENGTH);
    throw error;
  } finally {
    inflightCount -= 1;

    // 最后一层兜底：任何埋点异常都不能影响业务结果。
    try {
      emit(state);
    } catch {
      // ignore
    }
  }
};
