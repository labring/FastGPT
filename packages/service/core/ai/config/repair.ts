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
const baseBooleanKeys = ['isActive', 'testMode'] as const;
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

const getDocumentSources = (record: Record<string, unknown>) => {
  // config 字段一旦存在就表示该文档已进入新结构，即使 config 损坏也不能用
  // 残留 metadata 覆盖管理员已经保存的新字段。
  if (Object.prototype.hasOwnProperty.call(record, 'config')) {
    return [{ ...record, ...(toRecord(record.config) ?? {}) }];
  }

  const metadata = toRecord(record.metadata);
  // 旧顶层字段优先；字段本身无效时再逐字段回退 metadata，而不是整层覆盖。
  return metadata ? [record, metadata] : [record];
};

export type LegacyDefaultModelFlags = {
  isDefault?: boolean;
  isDefaultDatasetTextModel?: boolean;
  isDefaultDatasetImageModel?: boolean;
  isDefaultChatTitleModel?: boolean;
};

/** 迁移专用：按旧模型字段优先级读取默认标记，但不把这些字段写入 canonical ai_models。 */
export const getLegacyDefaultModelFlags = (record: unknown): LegacyDefaultModelFlags => {
  const raw = toRecord(record);
  if (!raw) return {};
  const sources = getDocumentSources(raw);
  const readBoolean = (key: keyof LegacyDefaultModelFlags) => {
    for (const source of sources) {
      const value = toBoolean(source[key]);
      if (value !== undefined) return value;
    }
  };

  return {
    isDefault: readBoolean('isDefault'),
    isDefaultDatasetTextModel: readBoolean('isDefaultDatasetTextModel'),
    isDefaultDatasetImageModel: readBoolean('isDefaultDatasetImageModel'),
    isDefaultChatTitleModel: readBoolean('isDefaultChatTitleModel')
  };
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
  const raw = toRecord(record);
  const canonical = SystemModelDocumentDataSchema.safeParse(record);
  // scope 在领域 Schema 中有默认值，便于新建系统模型；但迁移判定必须检查真实持久化字段。
  // 否则仅有旧 isSystem 的 canonical 文档会被默认成 system，并错误地跳过 scope 写回。
  if (canonical.success && raw?.scope === ModelScopeEnum.system) {
    return { status: 'unchanged', document: canonical.data, issues: [] };
  }

  if (!raw) return { status: 'invalid', issues: getIssues(record) };
  const sources = getDocumentSources(raw);
  const pluginSource: Record<string, unknown> = pluginDocument
    ? { ...pluginDocument, ...pluginDocument.config }
    : {};
  const readSource = <T>(reader: (source: Record<string, unknown>) => T | undefined) => {
    for (const source of sources) {
      const value = reader(source);
      if (value !== undefined) return value;
    }
  };
  const model = readSource((source) => toTrimmedString(source.model)) ?? pluginDocument?.model;
  const provider =
    readSource((source) => toTrimmedString(source.provider)) ?? pluginDocument?.provider;
  const name =
    readSource((source) => toTrimmedString(source.name)) ?? pluginDocument?.name ?? model;
  const type =
    readSource((source) =>
      modelTypes.has(source.type as ModelTypeEnum) ? (source.type as ModelTypeEnum) : undefined
    ) ?? pluginDocument?.type;

  if (!model || !provider || !name || !type) {
    return { status: 'invalid', issues: getIssues(record) };
  }

  const readNumber = (key: string, fallback?: number) =>
    readSource((source) => toFiniteNumber(source[key])) ??
    toFiniteNumber(pluginSource[key]) ??
    fallback;
  const readBoolean = (key: string) =>
    readSource((source) => toBoolean(source[key])) ?? toBoolean(pluginSource[key]);
  const readRecord = (key: string) =>
    readSource((source) => toRecord(source[key])) ?? toRecord(pluginSource[key]);
  const readArray = (key: string) =>
    readSource((source) => (Array.isArray(source[key]) ? source[key] : undefined)) ??
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
      readSource((source) =>
        typeof source.defaultSystemChatPrompt === 'string'
          ? source.defaultSystemChatPrompt
          : undefined
      ) ?? pluginSource.defaultSystemChatPrompt;
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
  for (const key of ['requestUrl', 'requestAuth'] as const) {
    const value =
      readSource((source) => toTrimmedString(source[key])) ?? toTrimmedString(pluginSource[key]);
    if (value !== undefined) document[key] = value;
  }
  for (const key of ['charsPointsPrice', 'inputPrice', 'outputPrice'] as const) {
    const value = readNumber(key);
    if (value !== undefined) document[key] = value;
  }
  const priceTiers =
    readSource((source) => parsePriceTiers(source.priceTiers)) ??
    parsePriceTiers(pluginSource.priceTiers);
  if (priceTiers) document.priceTiers = priceTiers;

  const repaired = SystemModelDocumentDataSchema.safeParse(document);
  if (!repaired.success) return { status: 'invalid', issues: getIssues(document) };

  return {
    status: isDeepStrictEqual(raw, repaired.data) ? 'unchanged' : 'repaired',
    document: repaired.data,
    issues: getIssues(record)
  };
};
