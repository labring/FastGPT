import { formatTime2YMDHM } from '../../../../common/string/time';
import { FROM_MIGRATION_CARRIER } from '../../type';
import {
  DatasetTagFilterFieldEnum,
  DatasetTagFilterLogicEnum,
  DatasetTagFilterValueModeEnum,
  type DatasetSearchValue,
  type DatasetTagFilterCondition,
  type DatasetTagFilterValue,
  type TagConditionObject,
  isDatasetTagFilterValue
} from './type';
import { isTagFilterOpWithoutValue } from './uiUtils';

/* ===== 引用解析助手 ===== */
const REF_MARKER = '$ref';

/** 判断是否为内嵌在检索载荷中的 3 元组引用：['$ref', nodeId, outputKey] */
export const isEmbeddedRef = (value: unknown): value is [string, string, string] =>
  Array.isArray(value) &&
  value.length === 3 &&
  value[0] === REF_MARKER &&
  typeof value[1] === 'string' &&
  typeof value[2] === 'string';

/** 排除 null 与数组，校验普通对象。 */
export const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/**
 * 识别非表单 AST 的检索载荷结构（`{ tags: { $and | $or: [...] }, ... }`），
 * 仅对此类结构执行 $ref 解引用，其余普通值原样透传。
 */
export const isDatasetSearchValue = (value: unknown): value is DatasetSearchValue => {
  if (!isPlainRecord(value)) return false;
  const tags = value.tags;
  if (tags === undefined) return true;
  if (!isPlainRecord(tags)) return false;
  return Object.entries(tags).every(
    ([logic, conditions]) => (logic === '$and' || logic === '$or') && Array.isArray(conditions)
  );
};

/** 解析单条标签条件对象 `{ [tag]: { [$op]: value } }` 中的内嵌引用。 */
export const resolveConditionRef = (
  condition: unknown,
  resolveReference: (value: unknown) => unknown
): unknown => {
  if (!isPlainRecord(condition)) return condition;

  let changed = false;
  const entries = Object.entries(condition).map(([tag, opObject]) => {
    if (!isPlainRecord(opObject)) return [tag, opObject] as const;

    let opChanged = false;
    const ops = Object.entries(opObject).map(([op, opValue]) => {
      if (!isEmbeddedRef(opValue)) return [op, opValue] as const;
      const resolvedValue = resolveReference([opValue[1], opValue[2]]);
      if (resolvedValue === undefined || resolvedValue === null) {
        return [op, opValue] as const;
      }
      opChanged = true;
      return [op, resolvedValue] as const;
    });
    if (!opChanged) return [tag, opObject] as const;

    changed = true;
    return [tag, Object.fromEntries(ops)] as const;
  });

  return changed ? Object.fromEntries(entries) : condition;
};

/** 解析检索载荷 tags 条件数组中内嵌的 3 元组引用。 */
export const resolveSearchValueRefs = (
  value: DatasetSearchValue,
  resolveReference: (value: unknown) => unknown
): DatasetSearchValue => {
  if (!value.tags) return value;

  let changed = false;
  const tags: NonNullable<DatasetSearchValue['tags']> = {};

  for (const logic of ['$and', '$or'] as const) {
    const conditions = value.tags[logic];
    if (!conditions) continue;

    const resolved = conditions.map((condition) =>
      resolveConditionRef(condition, resolveReference)
    );
    if (resolved.every((item, index) => item === conditions[index])) {
      tags[logic] = conditions;
      continue;
    }

    changed = true;
    tags[logic] = resolved;
  }

  return changed ? { ...value, tags } : value;
};

export const parseMaybeJson = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  if (
    !(
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))
    )
  ) {
    return value;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
};

const isTagCondition = (condition: DatasetTagFilterCondition) =>
  !condition.field || condition.field === DatasetTagFilterFieldEnum.tag;

const buildTagConditionObject = (
  condition: DatasetTagFilterCondition
): TagConditionObject | undefined => {
  if (!isTagCondition(condition)) return;
  const tag = condition.tag?.trim();
  const op = condition.op;
  if (!tag || !op) return;
  if (isTagFilterOpWithoutValue(op)) {
    return { [tag]: { [op]: true } };
  }
  if (
    condition.value === undefined ||
    condition.value === null ||
    condition.value === '' ||
    (Array.isArray(condition.value) && condition.value.length === 0)
  ) {
    return;
  }
  return { [tag]: { [op]: condition.value } };
};

const toCreateTimeString = (value: unknown): string | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return formatTime2YMDHM(value) || undefined;
  }
  if (typeof value !== 'string') return;
  const trimmed = value.trim();
  if (!trimmed) return;
  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? undefined : formatTime2YMDHM(parsed) || undefined;
};

const toIdList = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(/[\s,，]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return [String(value)];
  }
  return [];
};

const mergeTimeRange = (conditions: DatasetTagFilterCondition[]) => {
  const createTime: { $gte?: string; $lte?: string } = {};
  for (const condition of conditions) {
    if (condition.field !== DatasetTagFilterFieldEnum.createTime || !condition.op) continue;
    const time = toCreateTimeString(condition.value);
    if (!time) continue;
    if (condition.op === '$gte') {
      if (!createTime.$gte || time > createTime.$gte) createTime.$gte = time;
    } else if (condition.op === '$lte') {
      if (!createTime.$lte || time < createTime.$lte) createTime.$lte = time;
    }
  }
  return Object.keys(createTime).length > 0 ? createTime : undefined;
};

const mergeCollectionIds = (conditions: DatasetTagFilterCondition[]) => {
  const idLists = conditions
    .filter(
      (condition) =>
        condition.field === DatasetTagFilterFieldEnum.collectionId && condition.op === '$in'
    )
    .map((condition) => toIdList(condition.value))
    .filter((list) => list.length > 0);
  const collectionIds = [...new Set(idLists.flat())];
  return collectionIds.length > 0 ? collectionIds : undefined;
};

/**
 * 将前端条件行序列化为底层检索 JSON 字符串（tags 与可选 createTime / collectionIds）。
 * 文件属性作为顶层约束始终与标签结果求交集；未填写完整的行会被过滤；无有效条件时返回 undefined。
 */
export const serializeDatasetTagFilterValue = (
  value: DatasetTagFilterValue
): string | undefined => {
  const tagConditions = value.conditions
    .map(buildTagConditionObject)
    .filter((item): item is TagConditionObject => Boolean(item));

  const createTime = mergeTimeRange(value.conditions);
  const collectionIds = mergeCollectionIds(value.conditions);

  const payload: Record<string, unknown> = {};
  if (tagConditions.length > 0) {
    const key = value.logic === DatasetTagFilterLogicEnum.OR ? '$or' : '$and';
    payload.tags = { [key]: tagConditions };
  }
  if (createTime) {
    payload.createTime = createTime;
  }
  if (collectionIds) {
    payload.collectionIds = collectionIds;
  }
  if (Object.keys(payload).length === 0) return undefined;
  return JSON.stringify(payload);
};

const isReferenceTuple = (value: unknown): value is [string, string?] =>
  Array.isArray(value) &&
  value.length === 2 &&
  typeof value[0] === 'string' &&
  (value[1] === undefined || typeof value[1] === 'string');

const resolveConditionValue = (
  condition: DatasetTagFilterCondition,
  resolveReference: (value: unknown) => unknown
): DatasetTagFilterCondition => {
  if (condition.valueMode !== DatasetTagFilterValueModeEnum.reference) return condition;
  if (!isReferenceTuple(condition.value)) return { ...condition, value: undefined };
  return { ...condition, value: resolveReference(condition.value) };
};

/**
 * 搜索入口归一化构造器：
 * 将客户端多样化配置（老版 string 数组、深信服/外部带 $ref 的 string/对象、表单 AST 结构化数组）
 * 统一归一化为标准的底层检索 JSON 字符串（只包含结构化 TagCondition 数组）。
 */
export const formatCollectionFilterMatchParam = ({
  value,
  resolveReference = () => undefined
}: {
  value: unknown;
  resolveReference?: (value: unknown) => unknown;
}): string | undefined => {
  if (value === undefined || value === null || value === '') return undefined;

  const parsed = parseMaybeJson(value);
  const structured = isDatasetTagFilterValue(parsed) ? parsed : undefined;

  // 1. 表单 AST 结构：解析 reference 模式下的引用变量并序列化为检索 JSON
  if (structured) {
    const resolved: DatasetTagFilterValue = {
      logic: structured.logic,
      conditions: structured.conditions.map((condition) =>
        resolveConditionValue(condition, resolveReference)
      )
    };
    return serializeDatasetTagFilterValue(resolved);
  }

  // 2. 检索载荷结构（包含外部接口/深信服下发的 $ref 引用及老版 tags 格式）
  if (isPlainRecord(parsed)) {
    const payload = parsed as {
      tags?: { $and?: unknown[]; $or?: unknown[] };
      createTime?: { $gte?: string; $lte?: string };
      collectionIds?: string[];
      [key: string]: unknown;
    };

    let tagsPayload: Record<string, unknown> | undefined;

    if (payload.tags && isPlainRecord(payload.tags)) {
      const rawAnd = payload.tags.$and;
      const rawOr = payload.tags.$or;

      const isLegacyArray = (items?: unknown[]): boolean =>
        Array.isArray(items) &&
        items.length > 0 &&
        items.some((item) => typeof item === 'string' || item === null);

      if (isLegacyArray(rawAnd) || isLegacyArray(rawOr)) {
        // 老版 string / null 数组归一化为结构化 TagCondition 数组
        const activeRaw = isLegacyArray(rawAnd) && rawAnd.length > 0 ? rawAnd : rawOr;
        const isAnd = activeRaw === rawAnd;

        const hasNull = activeRaw.includes(null);
        const stringTags = [
          ...new Set(activeRaw.filter((tag): tag is string => typeof tag === 'string'))
        ];

        if (isAnd && hasNull && stringTags.length > 0) {
          tagsPayload = {
            $and: [
              { [FROM_MIGRATION_CARRIER]: { $empty: true } },
              { [FROM_MIGRATION_CARRIER]: { $notEmpty: true } }
            ]
          };
        } else {
          const legacyConditions: Record<string, Record<string, unknown>>[] = [];
          if (hasNull) {
            legacyConditions.push({ [FROM_MIGRATION_CARRIER]: { $empty: true } });
          }
          for (const str of stringTags) {
            const trimmed = str.trim();
            if (trimmed) {
              legacyConditions.push({ [FROM_MIGRATION_CARRIER]: { $contains: trimmed } });
            }
          }
          tagsPayload = isAnd ? { $and: legacyConditions } : { $or: legacyConditions };
        }
      } else {
        // 深信服版本 / 外部标准载荷：解析内嵌的 ['$ref', nodeId, outputKey]
        const resolved = resolveSearchValueRefs(payload as DatasetSearchValue, resolveReference);
        tagsPayload = resolved.tags;
      }
    }

    const normalizedResult: Record<string, unknown> = {};
    if (tagsPayload && Object.keys(tagsPayload).length > 0) {
      normalizedResult.tags = tagsPayload;
    }
    if (payload.createTime && isPlainRecord(payload.createTime)) {
      normalizedResult.createTime = payload.createTime;
    }
    if (Array.isArray(payload.collectionIds)) {
      normalizedResult.collectionIds = payload.collectionIds.map(String);
    }

    return Object.keys(normalizedResult).length > 0 ? JSON.stringify(normalizedResult) : undefined;
  }

  // 3. 纯单字符串老标签输入（如 "产品文档"）
  if (typeof value === 'string' && value.trim()) {
    return JSON.stringify({
      tags: {
        $and: [{ [FROM_MIGRATION_CARRIER]: { $contains: value.trim() } }]
      }
    });
  }

  return undefined;
};
