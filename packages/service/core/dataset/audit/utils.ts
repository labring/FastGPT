import { i18nT } from '@fastgpt/global/common/i18n/utils';
import {
  datasetConfigAuditItemLabelMap,
  type DatasetConfigAuditItem
} from '@fastgpt/global/core/dataset/audit/constants/config';
import { isEqual } from 'lodash-es';

/** 审计值允许为任意原始类型，写入前统一转成字符串落到 metadata。 */
type AuditRawValue = unknown;

/**
 * 凭据类字段名（包含匹配）。配置结构会随第三方集成扩展，
 * 宁可在少量非敏感字段上少展示内容，也不能漏出一个凭据。
 */
const sensitiveKeyPattern =
  /(token|secret|password|passwd|apikey|api_key|authorization|credential|cookie|privatekey|accesskey|signature)/i;

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
