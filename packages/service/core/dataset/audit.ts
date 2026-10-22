import { i18nT } from '@fastgpt/global/common/i18n/utils';
import {
  DatasetConfigAuditItemEnum,
  type DatasetConfigAuditItem
} from '@fastgpt/global/core/dataset/constants';
import type { ModelReferenceType } from '@fastgpt/global/core/ai/model/schema';
import type { DatasetSchemaType } from '@fastgpt/global/core/dataset/type';
import { isEqual } from 'lodash-es';
import type { ModelHandle } from '../ai/model/catalog/handle';
import { getDatasetModelReference } from './model';

/** 审计值允许为任意原始类型，写入前统一转成字符串落到 metadata。 */
type AuditRawValue = unknown;
type DatasetAuditModelData = { modelId?: string; model?: string; name?: string };

/**
 * 凭据类字段名（包含匹配）。配置结构会随第三方集成扩展，
 * 宁可在少量非敏感字段上少展示内容，也不能漏出一个凭据。
 */
const sensitiveKeyPattern =
  /(token|secret|password|passwd|apikey|api_key|authorization|credential|cookie|privatekey|accesskey|signature)/i;

const datasetConfigAuditItemLabelMap: Record<DatasetConfigAuditItem, string> = {
  [DatasetConfigAuditItemEnum.NAME]: i18nT('account_team:dataset_config_item_name'),
  [DatasetConfigAuditItemEnum.INTRO]: i18nT('account_team:dataset_config_item_intro'),
  [DatasetConfigAuditItemEnum.AVATAR]: i18nT('account_team:dataset_config_item_avatar'),
  [DatasetConfigAuditItemEnum.AGENT_MODEL]: i18nT('account_team:dataset_config_item_agentModel'),
  [DatasetConfigAuditItemEnum.VLM_MODEL]: i18nT('account_team:dataset_config_item_vlmModel'),
  [DatasetConfigAuditItemEnum.WEBSITE_CONFIG]: i18nT(
    'account_team:dataset_config_item_websiteConfig'
  ),
  [DatasetConfigAuditItemEnum.EXTERNAL_READ_URL]: i18nT(
    'account_team:dataset_config_item_externalReadUrl'
  ),
  [DatasetConfigAuditItemEnum.API_DATASET_SERVER]: i18nT(
    'account_team:dataset_config_item_apiDatasetServer'
  ),
  [DatasetConfigAuditItemEnum.AUTO_SYNC]: i18nT('account_team:dataset_config_item_autoSync'),
  [DatasetConfigAuditItemEnum.CHUNK_SETTINGS]: i18nT(
    'account_team:dataset_config_item_chunkSettings'
  ),
  [DatasetConfigAuditItemEnum.FILE_PARSE_CONFIG]: i18nT(
    'account_team:dataset_config_item_fileParseConfig'
  )
};

/** Mongoose 子文档会带 `_id`（以 Buffer 形式序列化），它不携带配置语义，一律剔除。 */
const shouldSkipKey = (key: string) => key === '_id' || key === '__v';

/**
 * 把单个配置值格式化成可读文本。
 *
 * 与「整棵对象直接 JSON.stringify」相比，这里刻意区分标量/对象：
 * 标量原样输出（避免出现 `"1000"` 这种引号噪声），数组用 `、` 连接，
 * 对象才退回 JSON —— 审计列表以人读为主，不是机器解析格式。
 */
const formatAuditScalar = (value: AuditRawValue): string => {
  if (value === undefined || value === null || value === '') return '-';
  if (typeof value === 'boolean') {
    return value ? i18nT('common:yes') : i18nT('common:no');
  }
  if (Array.isArray(value)) {
    return value.length === 0 ? '-' : value.map((item) => formatAuditScalar(item)).join('、');
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
};

/** 递归脱敏并剔除 `_id`；用于「必须整体展示」的兜底场景。 */
const sanitizeAuditValue = (input: AuditRawValue, key?: string): AuditRawValue => {
  if (key && sensitiveKeyPattern.test(key)) return '[REDACTED]';
  if (Array.isArray(input)) return input.map((item) => sanitizeAuditValue(item));
  if (input && typeof input === 'object') {
    return Object.fromEntries(
      Object.entries(input)
        .filter(([childKey]) => !shouldSkipKey(childKey))
        .map(([childKey, childValue]) => [childKey, sanitizeAuditValue(childValue, childKey)])
    );
  }
  return input;
};

type FlattenedAuditField = {
  path: string;
  value: AuditRawValue;
  sensitive: boolean;
};

/** 扁平化对象为「字段路径 → 原始值」；敏感字段仅在输出时脱敏，确保凭据轮换仍能被检测到。 */
const flattenAuditObject = (input: AuditRawValue, prefix = ''): FlattenedAuditField[] => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return [];

  const result: FlattenedAuditField[] = [];
  for (const [key, value] of Object.entries(input)) {
    if (shouldSkipKey(key)) continue;

    const path = prefix ? `${prefix}.${key}` : key;
    if (sensitiveKeyPattern.test(key)) {
      result.push({ path, value, sensitive: true });
      continue;
    }

    if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      const nested = flattenAuditObject(value, path);
      // 空对象也作为叶子保留，否则「清空整个子配置」会无法体现在日志里
      result.push(...(nested.length > 0 ? nested : [{ path, value, sensitive: false }]));
      continue;
    }

    result.push({ path, value, sensitive: false });
  }

  return result;
};

/**
 * 生成知识库配置变更的审计条目。
 *
 * 两条规则决定了展示形态：
 * 1. 对象型配置（`chunkSettings` / `websiteConfig` / 第三方来源等）按字段拆开，
 *    只输出真正变化的叶子字段，不把 20 个未变字段和 `_id` 一起灌进日志；
 * 2. 标量配置原样输出，不包 JSON 引号；模型项可用 compareValues 按稳定身份比较，同时只将可读名称写入日志。
 *
 * `changeItem` 存 i18n key 而不是翻译后的文本：审计日志按用户当前语言展示，
 * 写库时固定一种语言会在多语言团队里显示错乱。
 */
export const buildDatasetConfigAuditChanges = ({
  item,
  oldValue,
  newValue,
  enabled = true,
  compareValues
}: {
  item: DatasetConfigAuditItem;
  oldValue: AuditRawValue;
  newValue: AuditRawValue;
  enabled?: boolean;
  compareValues?: { oldValue: AuditRawValue; newValue: AuditRawValue };
}): Array<{ changeItem: string; oldValue: string; newValue: string }> => {
  if (!enabled) return [];

  const itemLabel = datasetConfigAuditItemLabelMap[item];
  const isObjectConfig =
    (oldValue && typeof oldValue === 'object' && !Array.isArray(oldValue)) ||
    (newValue && typeof newValue === 'object' && !Array.isArray(newValue));

  if (!isObjectConfig) {
    const valuesToCompare = compareValues ?? { oldValue, newValue };
    return isEqual(valuesToCompare.oldValue, valuesToCompare.newValue)
      ? []
      : [
          {
            changeItem: itemLabel,
            oldValue: formatAuditScalar(sanitizeAuditValue(oldValue)),
            newValue: formatAuditScalar(sanitizeAuditValue(newValue))
          }
        ];
  }

  const formatFieldValue = (field?: FlattenedAuditField) => {
    if (!field) return '-';
    if (field.sensitive) return '[REDACTED]';
    return formatAuditScalar(sanitizeAuditValue(field.value));
  };

  // 对象型配置按原始叶子值比对；顺序以新值为主，补上被删除的旧字段。
  const oldFields = flattenAuditObject(oldValue);
  const newFields = flattenAuditObject(newValue);
  const oldFieldMap = new Map(oldFields.map((field) => [field.path, field]));
  const newFieldMap = new Map(newFields.map((field) => [field.path, field]));
  const orderedPaths = [
    ...newFields.map((field) => field.path),
    ...oldFields.map((field) => field.path).filter((path) => !newFieldMap.has(path))
  ];

  return orderedPaths.flatMap((path) => {
    const oldField = oldFieldMap.get(path);
    const newField = newFieldMap.get(path);
    if (isEqual(oldField?.value, newField?.value)) return [];

    return [
      {
        // 子字段沿用父级 i18n 标签再拼上字段路径，保证列表里有上下文。
        changeItem: `${itemLabel} · ${path}`,
        oldValue: formatFieldValue(oldField),
        newValue: formatFieldValue(newField)
      }
    ];
  });
};

/**
 * 解析模型审计用的稳定身份和展示名称；身份始终优先使用 modelId，名称只用于日志文案。
 * 历史数据仅存 model 时继续以旧标识作身份，并优先展示目录名称或旧 model 名称。
 */
export const resolveDatasetAuditModel = ({
  reference,
  modelData
}: {
  reference: ModelReferenceType;
  modelData?: DatasetAuditModelData;
}) => {
  const legacyModel =
    reference.model && reference.model !== reference.modelId ? reference.model : undefined;

  return {
    modelId: modelData?.modelId || reference.modelId || legacyModel || '',
    modelName: modelData?.name || modelData?.model || legacyModel || i18nT('common:UnKnow')
  };
};

/**
 * 将 API 配置的局部请求展开成 Mongo dotted updates，并用同一批更新生成完整的有效新值。
 * 空对象和 null 与持久化路径一样不产生写入，数组作为叶子整体替换。
 */
export const buildDatasetConfigUpdatePatch = ({
  currentValue,
  patchValue,
  rootPath
}: {
  currentValue: unknown;
  patchValue: unknown;
  rootPath: string;
}): { updateFields: Record<string, unknown>; effectiveValue: unknown } => {
  const updateFields: Record<string, unknown> = {};

  const toRecord = (value: unknown): Record<string, unknown> => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

    const objectValue = value as { toObject?: () => unknown };
    const plainValue = typeof objectValue.toObject === 'function' ? objectValue.toObject() : value;
    return plainValue && typeof plainValue === 'object' && !Array.isArray(plainValue)
      ? Object.fromEntries(Object.entries(plainValue))
      : {};
  };

  const applyPatch = (
    current: unknown,
    patch: unknown,
    path: string
  ): { value: unknown; updated: boolean } => {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
      return { value: current, updated: false };
    }

    const currentRecord = toRecord(current);
    const nextRecord = { ...currentRecord };
    let updated = false;

    for (const [key, value] of Object.entries(patch)) {
      // Mongo update flattener treats null as an object with no enumerable fields, so it is a no-op.
      if (value === null) continue;

      const fieldPath = `${path}.${key}`;
      if (typeof value === 'object' && !Array.isArray(value)) {
        const nestedPatch = applyPatch(currentRecord[key], value, fieldPath);
        if (nestedPatch.updated) {
          nextRecord[key] = nestedPatch.value;
          updated = true;
        }
        continue;
      }

      updateFields[fieldPath] = value;
      nextRecord[key] = value;
      updated = true;
    }

    return { value: updated ? nextRecord : current, updated };
  };

  const { value: effectiveValue } = applyPatch(currentValue, patchValue, rootPath);
  return { updateFields, effectiveValue };
};

/**
 * 为知识库更新请求汇总待写入的配置审计条目；此函数只计算日志，不执行写入。
 * 未提交的字段会跳过，VLM 显式清空仍会保留旧名称作为旧值；模型按稳定 ID 判断变更，名称只用于展示。
 * 第三方来源配置必须传入与 Mongo dotted update 合并后的有效值，避免把未提交的子字段误记为删除。
 */
export const buildDatasetUpdateAuditLogs = ({
  dataset,
  modelHandle,
  update
}: {
  dataset: DatasetSchemaType;
  modelHandle: ModelHandle;
  update: {
    name?: string;
    intro?: string;
    avatar?: string;
    agentModelId?: string | null;
    agentModel?: string | null;
    agentModelData?: DatasetAuditModelData;
    vlmModelId?: string | null;
    vlmModel?: string | null;
    vlmModelData?: DatasetAuditModelData;
    clearVlmModel: boolean;
    websiteConfig?: unknown;
    externalReadUrl?: string;
    apiDatasetServer: { enabled: boolean; value?: unknown };
    autoSync?: boolean;
    chunkSettings?: unknown;
    chunkSettingsEnabled: boolean;
    fileParseConfig?: unknown;
  };
}) => {
  const agentReference = getDatasetModelReference(dataset, 'agent');
  const oldAgentModel = resolveDatasetAuditModel({
    reference: agentReference,
    modelData: modelHandle.findModelData(agentReference, { type: 'llm', vision: false })
  });
  const newAgentModel = update.agentModelData
    ? resolveDatasetAuditModel({
        reference: {
          modelId: update.agentModelData.modelId,
          model: update.agentModelData.model
        },
        modelData: update.agentModelData
      })
    : undefined;

  const vlmReference = getDatasetModelReference(dataset, 'vlm');
  const oldVlmModel = resolveDatasetAuditModel({
    reference: vlmReference,
    modelData: modelHandle.findModelData(vlmReference, { type: 'llm', vision: true })
  });
  const newVlmModel = update.vlmModelData
    ? resolveDatasetAuditModel({
        reference: { modelId: update.vlmModelData.modelId, model: update.vlmModelData.model },
        modelData: update.vlmModelData
      })
    : undefined;

  return [
    ...buildDatasetConfigAuditChanges({
      item: DatasetConfigAuditItemEnum.NAME,
      oldValue: dataset.name,
      newValue: update.name,
      enabled: Boolean(update.name)
    }),
    ...buildDatasetConfigAuditChanges({
      item: DatasetConfigAuditItemEnum.INTRO,
      oldValue: dataset.intro,
      newValue: update.intro,
      enabled: update.intro !== undefined
    }),
    ...buildDatasetConfigAuditChanges({
      item: DatasetConfigAuditItemEnum.AVATAR,
      oldValue: dataset.avatar,
      newValue: update.avatar,
      enabled: Boolean(update.avatar)
    }),
    ...buildDatasetConfigAuditChanges({
      item: DatasetConfigAuditItemEnum.AGENT_MODEL,
      oldValue: oldAgentModel.modelName,
      newValue: newAgentModel?.modelName,
      compareValues: {
        oldValue: oldAgentModel.modelId,
        newValue: newAgentModel?.modelId ?? ''
      },
      enabled:
        (update.agentModelId !== undefined || update.agentModel !== undefined) &&
        !!update.agentModelData
    }),
    ...buildDatasetConfigAuditChanges({
      item: DatasetConfigAuditItemEnum.VLM_MODEL,
      oldValue: oldVlmModel.modelName,
      newValue: update.clearVlmModel ? undefined : newVlmModel?.modelName,
      compareValues: {
        oldValue: oldVlmModel.modelId,
        newValue: update.clearVlmModel ? '' : (newVlmModel?.modelId ?? '')
      },
      enabled:
        (update.vlmModelId !== undefined || update.vlmModel !== undefined) &&
        (update.clearVlmModel || !!update.vlmModelData)
    }),
    ...buildDatasetConfigAuditChanges({
      item: DatasetConfigAuditItemEnum.WEBSITE_CONFIG,
      oldValue: dataset.websiteConfig,
      newValue: update.websiteConfig,
      enabled: update.websiteConfig !== undefined
    }),
    ...buildDatasetConfigAuditChanges({
      item: DatasetConfigAuditItemEnum.EXTERNAL_READ_URL,
      oldValue: dataset.externalReadUrl,
      newValue: update.externalReadUrl,
      enabled: update.externalReadUrl !== undefined
    }),
    ...buildDatasetConfigAuditChanges({
      item: DatasetConfigAuditItemEnum.API_DATASET_SERVER,
      oldValue: dataset.apiDatasetServer,
      newValue: update.apiDatasetServer.value,
      enabled: update.apiDatasetServer.enabled
    }),
    ...buildDatasetConfigAuditChanges({
      item: DatasetConfigAuditItemEnum.AUTO_SYNC,
      oldValue: dataset.autoSync,
      newValue: update.autoSync,
      enabled: typeof update.autoSync === 'boolean'
    }),
    ...buildDatasetConfigAuditChanges({
      item: DatasetConfigAuditItemEnum.CHUNK_SETTINGS,
      oldValue: dataset.chunkSettings,
      newValue: update.chunkSettings,
      enabled: update.chunkSettingsEnabled
    }),
    ...buildDatasetConfigAuditChanges({
      item: DatasetConfigAuditItemEnum.FILE_PARSE_CONFIG,
      oldValue: dataset.sangforFileParseConfig,
      newValue: update.fileParseConfig,
      enabled: update.fileParseConfig !== undefined
    })
  ];
};

/**
 * 兜底：把任意配置值转成审计展示字符串。
 *
 * 只在需要整体展示（非逐字段拆解）时使用，仍会脱敏并剔除 `_id`。
 */
export const stringifyDatasetConfigAuditValue = ({
  value
}: {
  value: AuditRawValue;
  fieldName?: string;
}): string => formatAuditScalar(sanitizeAuditValue(value));
