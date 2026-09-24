import type { ReferenceValueType } from '@fastgpt/global/core/workflow/type/io';
import { parseMaybeJson } from '@fastgpt/global/core/dataset/workflowTagFilter';

/**
 * Sangfor (深信服) OpenAPI / 三方工作流接口检索过滤载荷适配器。
 *
 * 职责：
 * 1. 识别 Sangfor 下发的检索 JSON 结构（`{ tags: { $and | $or: 条件项[] }, createTime?, collectionIds? }`）。
 * 2. 运行时解析内嵌在操作符值中的 3 元组引用 `['$ref', nodeId, outputKey]`，并替换为动态计算后的实际值。
 * 3. 保持与原生 FastGPT 核心逻辑解耦；当载荷无任何引用变更时保留原始文本，避免重排 JSON 键值顺序。
 */

const REF_MARKER = '$ref';

export type SangforEmbeddedRefTuple = [
  marker: typeof REF_MARKER,
  nodeId: string,
  outputKey: string
];

/** 校验值是否为 Sangfor 3 元组内嵌引用 `['$ref', nodeId, outputKey]` */
export const isSangforEmbeddedRef = (value: unknown): value is SangforEmbeddedRefTuple =>
  Array.isArray(value) &&
  value.length === 3 &&
  value[0] === REF_MARKER &&
  typeof value[1] === 'string' &&
  typeof value[2] === 'string';

export type SangforDatasetSearchPayload = {
  tags?: { $and?: unknown[]; $or?: unknown[] };
  createTime?: { $gte?: string; $lte?: string };
  collectionIds?: string[];
  [key: string]: unknown;
};

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/**
 * 校验对象是否为 Sangfor 检索载荷结构（必须为普通对象，且 tags 下仅挂 $and 或 $or 条件数组）
 */
export const isSangforDatasetSearchPayload = (
  value: unknown
): value is SangforDatasetSearchPayload => {
  if (!isPlainRecord(value)) return false;
  const tags = value.tags;
  if (tags === undefined) return 'createTime' in value || 'collectionIds' in value;
  if (!isPlainRecord(tags)) return false;
  return Object.entries(tags).every(
    ([logic, conditions]) => (logic === '$and' || logic === '$or') && Array.isArray(conditions)
  );
};

/**
 * 解析单个条件项中的 $ref 引用。
 * 条件项结构形如 `{ [tag]: { [op]: ['$ref', nodeId, outputKey] } }`。
 * 仅在存在实际引用替换时生成新对象，否则保持原对象引用。
 */
const resolveConditionEmbeddedRef = (
  condition: unknown,
  resolveReference: (ref: ReferenceValueType) => unknown
): unknown => {
  if (!isPlainRecord(condition)) return condition;

  let changed = false;
  const entries = Object.entries(condition).map(([tag, opObject]) => {
    if (!isPlainRecord(opObject)) return [tag, opObject] as const;

    let opChanged = false;
    const ops = Object.entries(opObject).map(([op, opValue]) => {
      if (!isSangforEmbeddedRef(opValue)) return [op, opValue] as const;
      const resolved = resolveReference([opValue[1], opValue[2]]);
      if (resolved === undefined || resolved === null) {
        return [op, opValue] as const;
      }
      opChanged = true;
      return [op, resolved] as const;
    });

    if (!opChanged) return [tag, opObject] as const;
    changed = true;
    return [tag, Object.fromEntries(ops)] as const;
  });

  return changed ? Object.fromEntries(entries) : condition;
};

/**
 * 遍历 Sangfor 检索载荷中的 tags 条件数组并求值内嵌的 `$ref`。
 * 仅在条件项发生变更时返回新载荷对象；若无任何变化，保持引用相等。
 */
export const resolveSangforSearchPayloadRefs = (
  payload: SangforDatasetSearchPayload,
  resolveReference: (ref: ReferenceValueType) => unknown
): SangforDatasetSearchPayload => {
  if (!payload.tags) return payload;

  let changed = false;
  const tags: NonNullable<SangforDatasetSearchPayload['tags']> = {};

  for (const logic of ['$and', '$or'] as const) {
    const conditions = payload.tags[logic];
    if (!conditions) continue;

    const resolved = conditions.map((condition) =>
      resolveConditionEmbeddedRef(condition, resolveReference)
    );
    if (resolved.every((item, index) => item === conditions[index])) {
      tags[logic] = conditions;
      continue;
    }

    changed = true;
    tags[logic] = resolved;
  }

  return changed ? { ...payload, tags } : payload;
};

/**
 * 适配 Sangfor 下发的 collectionFilterMatch 参数：
 * 解析检索载荷中内嵌的 3 元组 $ref，求值后重新格式化为 JSON 字符串。
 * 若入参并非 Sangfor 检索载荷格式，返回 undefined 由上层兜底。
 */
export const adaptSangforCollectionFilterMatch = ({
  value,
  parsedValue,
  resolveReference = () => undefined
}: {
  value: unknown;
  parsedValue?: unknown;
  resolveReference?: (ref: ReferenceValueType) => unknown;
}): string | undefined => {
  if (value === undefined || value === null || value === '') return undefined;

  const parsed = parsedValue !== undefined ? parsedValue : parseMaybeJson(value);
  if (!isSangforDatasetSearchPayload(parsed)) return undefined;

  const resolved = resolveSangforSearchPayloadRefs(parsed, resolveReference);
  if (typeof value === 'string') {
    return resolved === parsed ? value : JSON.stringify(resolved);
  }
  return JSON.stringify(resolved);
};
