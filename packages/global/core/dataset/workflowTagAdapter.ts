/**
 * 仅适配 Sangfor 的情况。
 *
 * 检索载荷中内嵌 $ref 引用的适配解析与接口专属标签类型识别。
 * 针对外部接口下发或非 FastGPT 表单 AST 的原始检索 JSON 载荷
 * （`{ tags: { $and | $or: 条件项[] }, createTime?, collectionIds? }`），
 * 解析内嵌在操作符值中的 3 元组引用 `['$ref', nodeId, outputKey]`，并替换为动态计算后的实际值。
 */

import { DatasetCollectionTagTypeEnum } from './constants';
import type { DatasetCollectionTagType } from './type';

const REF_MARKER = '$ref';

/** 判断是否为内嵌在检索载荷中的 3 元组引用：['$ref', nodeId, outputKey] */
export const isEmbeddedRef = (value: unknown): value is [string, string, string] =>
  Array.isArray(value) &&
  value.length === 3 &&
  value[0] === REF_MARKER &&
  typeof value[1] === 'string' &&
  typeof value[2] === 'string';

/**
 * 只由外部接口/适配下发的标签类型：不进条件行下拉，界面无入口创建。
 * 因此界面按下拉候选求交集时不予展示，剪枝时予以保留。
 */
export const isInterfaceOnlyTagFilterTagType = (tagType?: DatasetCollectionTagType) =>
  tagType === DatasetCollectionTagTypeEnum.string;

/**
 * 检索载荷结构：顶层包含 tags、createTime、collectionIds 等过滤条件。
 */
export type DatasetSearchValue = {
  tags?: { $and?: unknown[]; $or?: unknown[] };
  createTime?: { $gte?: string; $lte?: string };
  collectionIds?: string[];
  [key: string]: unknown;
};

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

/**
 * 解析单条标签条件对象 `{ [tag]: { [$op]: value } }` 中的内嵌引用。
 * 仅当 value 为 3 元组引用且解析出非空值时执行替换；未变化时返回原引用以避免不必要的对象重建。
 */
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

/**
 * 解析检索载荷 tags 条件数组中内嵌的 3 元组引用。
 * 未发生任何替换时返回入参本身（引用相等），供调用方决定是否保留原始输入。
 */
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
