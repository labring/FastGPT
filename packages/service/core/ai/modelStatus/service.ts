import {
  ModelStatusProbeConfigDefaults,
  ModelStatusProbeConfigSchema,
  type ModelStatusProbeConfig
} from '@fastgpt/global/common/system/config/modelStatus';
import { SystemConfigsTypeEnum } from '@fastgpt/global/common/system/config/constants';
import {
  ModelStatusProbeStatusEnum,
  type ModelStatusProbeStatus
} from '@fastgpt/global/core/ai/model/status';
import type { SystemModelDataType } from '@fastgpt/global/core/ai/model/schema';
import type {
  GetModelStatusResponse,
  ModelStatusProbeConfigResponse,
  ModelStatusProbeModel,
  ModelStatusProbeRecord,
  RunModelStatusProbeResponse,
  UpdateModelStatusProbeConfigBody
} from '@fastgpt/global/openapi/admin/system/model/status';
import { batchRun, delay } from '@fastgpt/global/common/system/utils';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { getLogger, LogCategories } from '../../../common/logger';
import { MongoSystemConfigs } from '../../../common/system/config/schema';
import { getModelHandle } from '../model';
import { MongoUser } from '../../../support/user/schema';
import { getUserDefaultTeam } from '../../../support/user/team/controller';
import { MongoModelStatusProbeRecord } from './schema';
import type { ModelStatusProbeRecordType } from './type';
import { testSystemModel } from './test';

const logger = getLogger(LogCategories.MODULE.AI.MODEL);

/** 判定为慢响应/高延迟的阈值（毫秒），超过 30 秒记为 yellow 状态 */
const MODEL_STATUS_HIGH_LATENCY_MS = 30000;
/** 探测单次调用失败后的最大重试次数（首次 + 3 次重试共 4 次） */
const MODEL_STATUS_MAX_RETRIES = 3;
/** 探测单次网络调用的超时时间（毫秒） */
const MODEL_STATUS_REQUEST_TIMEOUT_MS = 60000;
/** 探测失败后的重试间隔等待时间（毫秒） */
const MODEL_STATUS_RETRY_DELAY_MS = 500;
/** 多模型并发探测的最大并发数 */
const MODEL_STATUS_CONCURRENCY = 5;
/** 状态历史查询窗口（48 小时） */
const MODEL_STATUS_WINDOW_MS = 48 * 60 * 60 * 1000;

/** 记录当前正在执行的探测 Promise，用于同一进程防并发重入 */
let modelStatusProbeInFlight: Promise<RunModelStatusProbeResponse> | undefined;

/**
 * 读取数据库中存储的模型探测配置。
 * 若数据库中不存在或格式校验失败，则安全回退到系统默认配置并记录警告日志。
 */
const getStoredConfig = async (): Promise<ModelStatusProbeConfig> => {
  const record = await MongoSystemConfigs.findOne({
    type: SystemConfigsTypeEnum.modelStatusProbe
  })
    .sort({ createTime: -1 })
    .lean();

  const parsed = ModelStatusProbeConfigSchema.safeParse({
    ...ModelStatusProbeConfigDefaults,
    ...(record?.value ?? {})
  });
  if (parsed.success) return parsed.data;

  logger.warn('Invalid model status probe config; using defaults', {
    issues: parsed.error.issues
  });
  return ModelStatusProbeConfigDefaults;
};

/**
 * 将内部配置结构转换为脱敏的外部响应对象。
 * 敏感信息 webhookToken 仅转换为布尔值 webhookTokenConfigured，永不回显明文。
 */
const toConfigResponse = (config: ModelStatusProbeConfig): ModelStatusProbeConfigResponse => ({
  enabled: config.enabled,
  intervalMinutes: config.intervalMinutes,
  ...(config.webhookUrl ? { webhookUrl: config.webhookUrl } : {}),
  webhookTokenConfigured: !!config.webhookToken
});

/**
 * 读取模型状态探测配置。
 * 包含自动探测开关、探测间隔分钟、告警 Webhook 地址及 Token 配置标记（脱敏）。
 */
export const getModelStatusProbeConfig = async () => {
  const config = await getStoredConfig();
  return toConfigResponse(config);
};

/**
 * 保存探测配置。
 * 规则：
 * 1. webhookUrl 未传时保持旧值，传入空串或新地址则覆盖；
 * 2. webhookToken 未传时保持旧值，仅在 clearWebhookToken=true 时彻底清除已保存 Token。
 */
export const updateModelStatusProbeConfig = async (input: UpdateModelStatusProbeConfigBody) => {
  const current = await getStoredConfig();
  const next: ModelStatusProbeConfig = {
    enabled: input.enabled,
    intervalMinutes: input.intervalMinutes,
    ...(input.webhookUrl === undefined
      ? current.webhookUrl
        ? { webhookUrl: current.webhookUrl }
        : {}
      : input.webhookUrl
        ? { webhookUrl: input.webhookUrl }
        : {}),
    ...(input.clearWebhookToken
      ? {}
      : input.webhookToken === undefined
        ? current.webhookToken
          ? { webhookToken: current.webhookToken }
          : {}
        : input.webhookToken
          ? { webhookToken: input.webhookToken }
          : {})
  };

  const value = ModelStatusProbeConfigSchema.parse(next);
  await MongoSystemConfigs.create({
    type: SystemConfigsTypeEnum.modelStatusProbe,
    value,
    createTime: new Date()
  });

  return toConfigResponse(value);
};

/**
 * 获取 root 用户的默认团队 ID。
 * 部分模型（如 LLM）在通过标准链路调用时需要提供 teamId 上下文，优先使用 root 团队。
 */
const getRootTeamId = async () => {
  const root = await MongoUser.findOne({ username: 'root' }, { _id: 1 }).lean();
  if (!root) return undefined;

  try {
    return (await getUserDefaultTeam({ userId: String(root._id) })).teamId;
  } catch (error) {
    logger.warn('Unable to resolve root team for model status probe', { error });
    return undefined;
  }
};

/**
 * 将数据库探测记录转换为对齐 OpenAPI 契约的响应对象，时间格式化为 ISO 8601 字符串。
 */
const toRecordResponse = (record: ModelStatusProbeRecordType): ModelStatusProbeRecord => ({
  modelId: record.modelId,
  name: record.name,
  model: record.model,
  provider: record.provider,
  type: record.type,
  status: record.status,
  ...(record.latencyMs === undefined ? {} : { latencyMs: record.latencyMs }),
  attempts: record.attempts,
  ...(record.error ? { error: record.error } : {}),
  testedAt: record.testedAt.toISOString()
});

/**
 * 将单个模型及其 48 小时内的探测历史聚合为模型状态展示对象。
 * 包含：
 * - 最新一次探测状态与详情；
 * - 48 小时成功率（百分比保留 2 位小数，排除 red 异常状态）；
 * - 总探测次数与完整时间线记录。
 */
const getModelStatusItem = ({
  model,
  records
}: {
  model: SystemModelDataType;
  records: ModelStatusProbeRecordType[];
}): ModelStatusProbeModel => {
  const latest = records.at(-1);
  const successfulCount = records.filter(
    (record) => record.status !== ModelStatusProbeStatusEnum.red
  ).length;
  const stabilityPercent = records.length
    ? Number(((successfulCount / records.length) * 100).toFixed(2))
    : 0;

  return {
    modelId: model.modelId,
    name: model.name,
    model: model.model,
    provider: model.provider,
    ...(model.avatar ? { avatar: model.avatar } : {}),
    type: model.type,
    status: latest?.status ?? 'unknown',
    latest: latest ? toRecordResponse(latest) : null,
    records: records.map(toRecordResponse),
    stabilityPercent,
    totalChecks: records.length
  };
};

/**
 * 返回启用模型最近 48 小时的状态快照。记录按模型、时间升序分组，保证前端时间线可直接渲染。
 * 同时统计绿/黄/红状态的模型总数与最近一次探测完成时间。
 */
export const getModelStatus = async (): Promise<GetModelStatusResponse> => {
  const [config, modelHandle] = await Promise.all([getStoredConfig(), getModelHandle()]);
  const models = [...modelHandle.getActiveModels()] as SystemModelDataType[];
  const modelIds = models.map((model) => model.modelId);
  const since = new Date(Date.now() - MODEL_STATUS_WINDOW_MS);
  const records = modelIds.length
    ? await MongoModelStatusProbeRecord.find({
        modelId: { $in: modelIds },
        testedAt: { $gte: since }
      })
        .sort({ testedAt: 1 })
        .lean()
    : [];

  const recordsByModelId = new Map<string, ModelStatusProbeRecordType[]>();
  for (const record of records) {
    const modelRecords = recordsByModelId.get(record.modelId) ?? [];
    modelRecords.push(record);
    recordsByModelId.set(record.modelId, modelRecords);
  }

  const statusModels = models.map((model) =>
    getModelStatusItem({ model, records: recordsByModelId.get(model.modelId) ?? [] })
  );
  const summary = statusModels.reduce(
    (result, model) => {
      if (model.status === 'unknown') result.unknown += 1;
      else result[model.status] += 1;
      return result;
    },
    { enabledModels: models.length, green: 0, yellow: 0, red: 0, unknown: 0 }
  );
  const lastProbeTime = records.at(-1)?.testedAt.toISOString() ?? null;

  return {
    config: toConfigResponse(config),
    summary,
    models: statusModels,
    lastProbeTime
  };
};

/**
 * 对单个模型执行一次探测并计算最终状态。通过注入 test 函数保留纯业务边界，便于验证重试和延迟阈值。
 * 规则：
 * 1. 首次请求失败后自动重试最多 3 次（单轮最多 4 次调用）；
 * 2. 只要有任意一次调用成功即判定为有效：耗时 > 30s 记为 yellow（高延迟），耗时 <= 30s 记为 green（正常）；
 * 3. 连续 4 次均失败则判定为 red（异常），记录最大重试次数和错误详情（截断至 1000 字符）。
 */
export const probeModelStatus = async ({
  model,
  teamId,
  testedAt,
  test = testSystemModel
}: {
  model: SystemModelDataType;
  teamId?: string;
  testedAt: Date;
  test?: typeof testSystemModel;
}): Promise<ModelStatusProbeRecordType> => {
  let lastError: unknown;

  for (let retry = 0; retry <= MODEL_STATUS_MAX_RETRIES; retry++) {
    const startedAt = Date.now();
    try {
      await test({
        model,
        teamId,
        timeoutMs: MODEL_STATUS_REQUEST_TIMEOUT_MS
      });
      const latencyMs = Date.now() - startedAt;
      return {
        modelId: model.modelId,
        name: model.name,
        model: model.model,
        provider: model.provider,
        type: model.type,
        status:
          latencyMs > MODEL_STATUS_HIGH_LATENCY_MS
            ? ModelStatusProbeStatusEnum.yellow
            : ModelStatusProbeStatusEnum.green,
        latencyMs,
        attempts: retry + 1,
        testedAt
      };
    } catch (error) {
      lastError = error;
      if (retry < MODEL_STATUS_MAX_RETRIES) await delay(MODEL_STATUS_RETRY_DELAY_MS);
    }
  }

  return {
    modelId: model.modelId,
    name: model.name,
    model: model.model,
    provider: model.provider,
    type: model.type,
    status: ModelStatusProbeStatusEnum.red,
    attempts: MODEL_STATUS_MAX_RETRIES + 1,
    error: String(getErrText(lastError, 'Model test failed')).slice(0, 1000),
    testedAt
  };
};

/**
 * 检查并发送模型状态变动 Webhook 告警。
 * 告警触发规则（边沿触发与防风暴机制）：
 * - 故障告警 (model_status_error): 模型状态由非红色（正常/高延迟）变为红色时发送；
 * - 恢复通知 (model_status_recovered): 模型状态由红色恢复为非红色（正常/高延迟）时发送；
 * - 状态无变化时（持续正常或持续异常）不重复发送，避免告警风暴。
 * 单次 Webhook 请求超时限制为 5 秒，失败仅记录日志不阻断探测流程。
 */
const sendModelWebhook = async ({
  config,
  record,
  previousStatus
}: {
  config: ModelStatusProbeConfig;
  record: ModelStatusProbeRecordType;
  previousStatus?: ModelStatusProbeStatus;
}) => {
  if (!config.webhookUrl) return;

  const event =
    record.status === ModelStatusProbeStatusEnum.red && previousStatus !== record.status
      ? 'model_status_error'
      : record.status !== ModelStatusProbeStatusEnum.red &&
          previousStatus === ModelStatusProbeStatusEnum.red
        ? 'model_status_recovered'
        : undefined;
  if (!event) return;

  try {
    const response = await fetch(config.webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.webhookToken ? { Authorization: `Bearer ${config.webhookToken}` } : {})
      },
      body: JSON.stringify({
        event,
        status: record.status,
        model: {
          modelId: record.modelId,
          name: record.name,
          model: record.model,
          provider: record.provider,
          type: record.type
        },
        probe: {
          attempts: record.attempts,
          latencyMs: record.latencyMs,
          error: record.error,
          testedAt: record.testedAt.toISOString()
        }
      }),
      signal: AbortSignal.timeout(5000)
    });

    if (!response.ok) {
      throw new Error(`Webhook responded with HTTP ${response.status}`);
    }
  } catch (error) {
    logger.warn('Model status webhook failed', {
      event,
      modelId: record.modelId,
      error
    });
  }
};

/**
 * 持久化单条模型探测记录，并比对上一条记录状态判断是否触发 Webhook 告警推送。
 */
const saveProbeRecord = async ({
  config,
  record
}: {
  config: ModelStatusProbeConfig;
  record: ModelStatusProbeRecordType;
}) => {
  const previous = await MongoModelStatusProbeRecord.findOne({ modelId: record.modelId })
    .sort({ testedAt: -1 })
    .lean();

  await MongoModelStatusProbeRecord.create(record);
  await sendModelWebhook({
    config,
    record,
    previousStatus: previous?.status
  });

  return record;
};

/**
 * 执行一轮模型探测。定时任务在调用前判断开关；管理员的立即探测允许在关闭定时任务时手动执行。
 * 控制逻辑：
 * 1. 检查 enabled 开关，若未开启且未设置 force=true 则跳过；
 * 2. 同一进程内防并发重入：若已有探测在执行，复用正在进行的 Promise；
 * 3. 并发控制：以并发度 5 批处理所有已启用的系统模型，每完成一个模型入库并按需触发告警。
 */
export const runModelStatusProbe = async ({
  teamId,
  force = false
}: {
  teamId?: string;
  force?: boolean;
} = {}): Promise<RunModelStatusProbeResponse> => {
  const config = await getStoredConfig();
  if (!config.enabled && !force) {
    return { skipped: true, testedAt: new Date().toISOString(), records: [] };
  }

  // 手动探测可能和整点 cron 同时触发；同一进程只保留一轮真实请求，避免重复打供应商。
  if (modelStatusProbeInFlight) return modelStatusProbeInFlight;

  const probePromise = (async () => {
    const [modelHandle, resolvedTeamId] = await Promise.all([
      getModelHandle(),
      teamId ? Promise.resolve(teamId) : getRootTeamId()
    ]);
    const models = modelHandle.getActiveModels();
    const testedAt = new Date();
    const records = await batchRun(
      models,
      async (model) =>
        saveProbeRecord({
          config,
          record: await probeModelStatus({ model, teamId: resolvedTeamId, testedAt })
        }),
      MODEL_STATUS_CONCURRENCY
    );

    return {
      skipped: false,
      testedAt: testedAt.toISOString(),
      records: records.map(toRecordResponse)
    };
  })();

  modelStatusProbeInFlight = probePromise;
  try {
    return await probePromise;
  } finally {
    if (modelStatusProbeInFlight === probePromise) modelStatusProbeInFlight = undefined;
  }
};

/**
 * 定时任务检查并执行模型探测：
 * 校验自动探测配置是否启用，以及当前分钟是否满足探测间隔要求，
 * 满足条件时触发本轮模型探测。
 * 内部捕获异常并记录日志，避免失败抛出阻断外部调用。
 */
export const checkAndRunModelStatusProbe = async (now: Date = new Date()) => {
  try {
    const config = await getModelStatusProbeConfig();
    if (!config.enabled) return;

    if (now.getMinutes() % config.intervalMinutes !== 0) return;

    return await runModelStatusProbe();
  } catch (error) {
    // 探测失败不能阻断同一进程的其他定时任务，具体模型失败已记录为红色。
    logger.error('Model status probe cron failed', { error });
  }
};

/** 获取模型状态探测内部常量（供单测与调试使用） */
export const getModelStatusProbeConstants = () => ({
  highLatencyMs: MODEL_STATUS_HIGH_LATENCY_MS,
  maxRetries: MODEL_STATUS_MAX_RETRIES,
  requestTimeoutMs: MODEL_STATUS_REQUEST_TIMEOUT_MS
});
