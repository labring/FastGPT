import { isDeepStrictEqual } from 'node:util';
import {
  defaultQAModels,
  defaultVectorModels,
  ModelScopeEnum,
  ModelTypeEnum
} from '@fastgpt/global/core/ai/constants';
import {
  ModelPriceTierSchema,
  SystemModelDocumentDataSchema,
  type SystemModelDocumentDataType
} from '@fastgpt/global/core/ai/model.schema';
import { MongoSystemModel } from './schema';

const configKeysMap: Record<ModelTypeEnum, string[]> = {
  [ModelTypeEnum.llm]: [
    'maxContext',
    'maxResponse',
    'quoteMaxToken',
    'maxTemperature',
    'showTopP',
    'responseFormatList',
    'showStopSign',
    'censor',
    'vision',
    'audio',
    'video',
    'reasoning',
    'reasoningEffort',
    'functionCall',
    'toolChoice',
    'defaultSystemChatPrompt',
    'defaultConfig',
    'fieldMap'
  ],
  [ModelTypeEnum.embedding]: [
    'defaultToken',
    'maxToken',
    'weight',
    'hidden',
    'vision',
    'normalization',
    'batchSize',
    'defaultConfig',
    'dbConfig',
    'queryConfig'
  ],
  [ModelTypeEnum.rerank]: ['maxToken', 'defaultConfig'],
  [ModelTypeEnum.tts]: ['voices'],
  [ModelTypeEnum.stt]: []
};

const modelTypes = new Set(Object.values(ModelTypeEnum));
const baseBooleanKeys = ['isActive', 'isDefault', 'testMode'] as const;
const llmBooleanKeys = [
  'isDefaultDatasetTextModel',
  'isDefaultDatasetImageModel',
  'isDefaultChatTitleModel'
] as const;
const llmConfigBooleanKeys = [
  'showTopP',
  'showStopSign',
  'censor',
  'vision',
  'audio',
  'video',
  'reasoning',
  'reasoningEffort',
  'functionCall',
  'toolChoice'
] as const;
const embeddingConfigBooleanKeys = ['hidden', 'vision', 'normalization'] as const;

const pickDefined = (source: Record<string, unknown>, keys: string[]) =>
  Object.fromEntries(
    keys.filter((key) => source[key] !== undefined).map((key) => [key, source[key]])
  );

const toTrimmedString = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

const toFiniteNumber = (value: unknown) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string' || value.trim() === '') return;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
};

const toBoolean = (value: unknown) => {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
};

const toRecord = (value: unknown) =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const getDocumentSource = (record: Record<string, unknown>) => {
  // config 字段一旦存在就表示该文档已进入新结构，即使 config 损坏也不能用
  // 残留 metadata 覆盖管理员已经保存的新字段。
  if (Object.prototype.hasOwnProperty.call(record, 'config')) {
    return { ...record, ...(toRecord(record.config) ?? {}) };
  }

  const metadata = toRecord(record.metadata);
  return metadata ? { ...metadata, model: record.model ?? metadata.model } : record;
};

const parsePriceTiers = (value: unknown) => {
  const parsed = (() => {
    if (typeof value !== 'string') return value;
    if (!value.trim()) return;
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return;
    }
  })();
  if (!Array.isArray(parsed)) return;

  const tiers = parsed.flatMap((tier) => {
    const item = toRecord(tier);
    if (!item) return [];
    const normalized = ModelPriceTierSchema.safeParse({
      minInputTokens: toFiniteNumber(item.minInputTokens),
      maxInputTokens: toFiniteNumber(item.maxInputTokens),
      inputPrice: toFiniteNumber(item.inputPrice),
      outputPrice: toFiniteNumber(item.outputPrice)
    });
    return normalized.success ? [normalized.data] : [];
  });
  return tiers.length > 0 ? tiers : undefined;
};

const getIssues = (record: unknown) => {
  const parsed = SystemModelDocumentDataSchema.safeParse(record);
  return parsed.success
    ? []
    : parsed.error.issues.map((issue) => ({
        path: issue.path.map((item) =>
          typeof item === 'symbol' ? (item.description ?? '') : item
        ),
        message: issue.message
      }));
};

export type RepairSystemModelResult =
  | {
      status: 'unchanged' | 'repaired';
      document: SystemModelDocumentDataType;
      issues: Array<{ path: Array<string | number>; message: string }>;
    }
  | {
      status: 'invalid';
      issues: Array<{ path: Array<string | number>; message: string }>;
    };

/** 将插件协议的扁平模型转换成 canonical 持久化结构。 */
export const flatModelToDocumentData = (
  input: Record<string, any>
): SystemModelDocumentDataType => {
  const normalized = { ...input };
  if (normalized.type === ModelTypeEnum.llm) {
    normalized.maxResponse = normalized.maxResponse ?? normalized.maxTokens ?? 16000;
    if (normalized.maxTemperature === null) delete normalized.maxTemperature;
  }

  const config = {
    ...pickDefined(normalized, configKeysMap[normalized.type as ModelTypeEnum] ?? []),
    ...(normalized.config && typeof normalized.config === 'object' ? normalized.config : {})
  };

  return SystemModelDocumentDataSchema.parse(
    Object.fromEntries(
      Object.entries({ ...normalized, scope: ModelScopeEnum.system, config }).filter(
        ([, value]) => value !== undefined
      )
    )
  );
};

/**
 * 按单个模型修复新旧结构。合法 canonical 文档不会被旧 metadata 覆盖；非法可选字段会被
 * 丢弃，必填配置使用插件模板或类型默认值补齐。无法恢复模型身份时返回 invalid。
 */
export const repairSystemModelDocument = ({
  record,
  pluginDocument
}: {
  record: unknown;
  pluginDocument?: SystemModelDocumentDataType;
}): RepairSystemModelResult => {
  const canonical = SystemModelDocumentDataSchema.safeParse(record);
  if (canonical.success) {
    return { status: 'unchanged', document: canonical.data, issues: [] };
  }

  const raw = toRecord(record);
  if (!raw) return { status: 'invalid', issues: getIssues(record) };
  const source = getDocumentSource(raw);
  const pluginSource: Record<string, unknown> = pluginDocument
    ? { ...pluginDocument, ...pluginDocument.config }
    : {};
  const model = toTrimmedString(source.model) ?? pluginDocument?.model;
  const provider = toTrimmedString(source.provider) ?? pluginDocument?.provider;
  const name = toTrimmedString(source.name) ?? pluginDocument?.name ?? model;
  const type = modelTypes.has(source.type as ModelTypeEnum)
    ? (source.type as ModelTypeEnum)
    : pluginDocument?.type;

  if (!model || !provider || !name || !type) {
    return { status: 'invalid', issues: getIssues(record) };
  }

  const readNumber = (key: string, fallback?: number) =>
    toFiniteNumber(source[key]) ?? toFiniteNumber(pluginSource[key]) ?? fallback;
  const readBoolean = (key: string) => toBoolean(source[key]) ?? toBoolean(pluginSource[key]);
  const readRecord = (key: string) => toRecord(source[key]) ?? toRecord(pluginSource[key]);
  const readArray = (key: string) =>
    (Array.isArray(source[key]) ? source[key] : undefined) ??
    (Array.isArray(pluginSource[key]) ? pluginSource[key] : undefined);
  const config: Record<string, unknown> = {};

  if (type === ModelTypeEnum.llm) {
    config.maxContext = readNumber('maxContext', defaultQAModels[0].config.maxContext);
    config.maxResponse = readNumber('maxResponse', defaultQAModels[0].config.maxResponse);
    config.quoteMaxToken = readNumber('quoteMaxToken', defaultQAModels[0].config.quoteMaxToken);
    const maxTemperature = readNumber('maxTemperature');
    if (maxTemperature !== undefined) config.maxTemperature = maxTemperature;
    llmConfigBooleanKeys.forEach((key) => {
      const value = readBoolean(key);
      if (value !== undefined) config[key] = value;
    });
    const responseFormatList = readArray('responseFormatList');
    if (
      Array.isArray(responseFormatList) &&
      responseFormatList.every((item) => typeof item === 'string')
    ) {
      config.responseFormatList = responseFormatList;
    }
    const defaultSystemChatPrompt =
      typeof source.defaultSystemChatPrompt === 'string'
        ? source.defaultSystemChatPrompt
        : pluginSource.defaultSystemChatPrompt;
    if (typeof defaultSystemChatPrompt === 'string') {
      config.defaultSystemChatPrompt = defaultSystemChatPrompt;
    }
    const defaultConfig = readRecord('defaultConfig');
    if (defaultConfig) config.defaultConfig = defaultConfig;
    const fieldMap = readRecord('fieldMap');
    if (fieldMap && Object.values(fieldMap).every((item) => typeof item === 'string')) {
      config.fieldMap = fieldMap;
    }
  } else if (type === ModelTypeEnum.embedding) {
    config.defaultToken = readNumber('defaultToken', defaultVectorModels[0].config.defaultToken);
    config.maxToken = readNumber('maxToken', defaultVectorModels[0].config.maxToken);
    config.weight = readNumber('weight', 0);
    const batchSize = readNumber('batchSize');
    if (batchSize !== undefined) config.batchSize = batchSize;
    embeddingConfigBooleanKeys.forEach((key) => {
      const value = readBoolean(key);
      if (value !== undefined) config[key] = value;
    });
    for (const key of ['defaultConfig', 'dbConfig', 'queryConfig'] as const) {
      const value = readRecord(key);
      if (value) config[key] = value;
    }
  } else if (type === ModelTypeEnum.rerank) {
    const maxToken = readNumber('maxToken');
    if (maxToken !== undefined) config.maxToken = maxToken;
    const defaultConfig = readRecord('defaultConfig');
    if (defaultConfig) config.defaultConfig = defaultConfig;
  } else if (type === ModelTypeEnum.tts) {
    const voices = readArray('voices');
    config.voices = Array.isArray(voices)
      ? voices.flatMap((voice) => {
          const item = toRecord(voice);
          const label = toTrimmedString(item?.label);
          const value = toTrimmedString(item?.value);
          return label && value ? [{ label, value }] : [];
        })
      : [];
  }

  const document: Record<string, unknown> = {
    type,
    provider,
    model,
    name,
    scope: ModelScopeEnum.system,
    config
  };
  baseBooleanKeys.forEach((key) => {
    const value = readBoolean(key);
    if (value !== undefined) document[key] = value;
  });
  if (type === ModelTypeEnum.llm) {
    llmBooleanKeys.forEach((key) => {
      const value = readBoolean(key);
      if (value !== undefined) document[key] = value;
    });
  }
  for (const key of ['requestUrl', 'requestAuth'] as const) {
    const value = toTrimmedString(source[key]) ?? toTrimmedString(pluginSource[key]);
    if (value !== undefined) document[key] = value;
  }
  for (const key of ['charsPointsPrice', 'inputPrice', 'outputPrice'] as const) {
    const value = readNumber(key);
    if (value !== undefined) document[key] = value;
  }
  const priceTiers = parsePriceTiers(source.priceTiers) ?? parsePriceTiers(pluginSource.priceTiers);
  if (priceTiers) document.priceTiers = priceTiers;

  const repaired = SystemModelDocumentDataSchema.safeParse(document);
  if (!repaired.success) return { status: 'invalid', issues: getIssues(document) };

  return {
    status: isDeepStrictEqual(raw, repaired.data) ? 'unchanged' : 'repaired',
    document: repaired.data,
    issues: getIssues(record)
  };
};

export type RepairStoredSystemModelsResult = {
  scanned: number;
  unchanged: number;
  repaired: number;
  deleted: number;
  deletedModels: Array<{
    modelId: string;
    model?: string;
  }>;
};

/**
 * 启动加载前逐条接管 system_models。可修复记录使用快照条件更新；无法修复记录使用快照
 * 条件删除，避免多实例启动覆盖另一个实例刚完成的管理员更新。
 */
export const repairStoredSystemModels = async ({
  pluginDocuments
}: {
  pluginDocuments: SystemModelDocumentDataType[];
}): Promise<RepairStoredSystemModelsResult> => {
  const records = await MongoSystemModel.collection.find({}).toArray();
  const pluginMap = new Map(pluginDocuments.map((item) => [item.model, item]));
  const stats: RepairStoredSystemModelsResult = {
    scanned: records.length,
    unchanged: 0,
    repaired: 0,
    deleted: 0,
    deletedModels: []
  };
  const operations: Array<Parameters<typeof MongoSystemModel.collection.bulkWrite>[0][number]> = [];
  const deleteCandidates: Array<{
    _id: (typeof records)[number]['_id'];
    modelId: string;
    model?: string;
  }> = [];

  records.forEach((record) => {
    const result = repairSystemModelDocument({
      record,
      pluginDocument: pluginMap.get(String(record.model))
    });
    if (result.status === 'unchanged') {
      stats.unchanged += 1;
      return;
    }
    const snapshotFilter =
      record.config === undefined
        ? { _id: record._id, config: { $exists: false } }
        : { _id: record._id, config: record.config };
    if (result.status === 'repaired') {
      stats.repaired += 1;
      operations.push({
        updateOne: {
          filter: snapshotFilter,
          update: { $set: result.document, $unset: { isSystem: '' } }
        }
      });
      return;
    }
    deleteCandidates.push({
      _id: record._id,
      modelId: String(record._id),
      model: toTrimmedString(record.model)
    });
    operations.push({ deleteOne: { filter: snapshotFilter } });
  });

  if (operations.length > 0) {
    await MongoSystemModel.collection.bulkWrite(operations, { ordered: false });
  }
  if (deleteCandidates.length > 0) {
    // 快照条件可能因并发更新而失效，只记录数据库中已经不存在的模型，避免误报删除。
    const remainingIds = new Set(
      (
        await MongoSystemModel.collection
          .find(
            { _id: { $in: deleteCandidates.map((item) => item._id) } },
            { projection: { _id: 1 } }
          )
          .toArray()
      ).map((item) => String(item._id))
    );
    stats.deletedModels = deleteCandidates
      .filter((item) => !remainingIds.has(item.modelId))
      .map(({ modelId, model }) => ({ modelId, model }));
    stats.deleted = stats.deletedModels.length;
  }
  return stats;
};
