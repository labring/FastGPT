import { z } from 'zod';
import { i18nT } from '../../common/i18n/utils';
import { formatTime2YMDHM } from '../../common/string/time';
import {
  DatasetCollectionTagTypeEnum,
  tagFilterOperators,
  createTimeOperators,
  collectionIdOperators,
  emptyValueOperators
} from './constants';
import type { DatasetCollectionTagType, DatasetTagType } from './type';
import {
  isDatasetSearchValue,
  isInterfaceOnlyTagFilterTagType,
  resolveSearchValueRefs
} from './workflowTagAdapter';

export const DatasetTagFilterLogicEnum = {
  AND: 'AND',
  OR: 'OR'
} as const;

export const DatasetTagFilterValueModeEnum = {
  input: 'input',
  reference: 'reference'
} as const;
export type DatasetTagFilterValueMode =
  (typeof DatasetTagFilterValueModeEnum)[keyof typeof DatasetTagFilterValueModeEnum];

export const DatasetTagFilterVersionEnum = {
  legacy: 'legacy',
  structured: 'structured'
} as const;
export const DatasetTagFilterVersionSchema = z.enum(DatasetTagFilterVersionEnum);
export type DatasetTagFilterVersion = z.infer<typeof DatasetTagFilterVersionSchema>;

const hasDatasetTagFilterConfiguration = (value: unknown) => {
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== null;
};

/**
 * 解析知识库标签过滤版本。
 * 显式版本优先；存量节点缺少版本时，有过滤配置走 legacy，无配置直接使用 structured。
 */
export const resolveDatasetTagFilterVersion = ({
  version,
  filterValue
}: {
  version: unknown;
  filterValue: unknown;
}): DatasetTagFilterVersion => {
  if (version === DatasetTagFilterVersionEnum.structured) {
    return DatasetTagFilterVersionEnum.structured;
  }
  if (version === DatasetTagFilterVersionEnum.legacy) return DatasetTagFilterVersionEnum.legacy;
  if (version !== undefined && version !== null && version !== '') {
    return DatasetTagFilterVersionEnum.legacy;
  }
  return hasDatasetTagFilterConfiguration(filterValue)
    ? DatasetTagFilterVersionEnum.legacy
    : DatasetTagFilterVersionEnum.structured;
};

/** 归一化旧版编辑器字符串过滤值。 */
export const normalizeLegacyDatasetTagFilterValue = (value: unknown) =>
  typeof value === 'string' ? value : '';

/** 条件行字段来源：知识库标签或固定文件属性。 */
export const DatasetTagFilterFieldEnum = {
  tag: 'tag',
  createTime: 'createTime',
  collectionId: 'collectionId'
} as const;
export type DatasetTagFilterField =
  (typeof DatasetTagFilterFieldEnum)[keyof typeof DatasetTagFilterFieldEnum];

/**
 * 界面下拉支持配置的标签类型。
 * string 类型仅由接口/OpenAPI 下发，不进入界面选择器下拉。
 */
export const UI_SUPPORTED_TAG_TYPES = [
  DatasetCollectionTagTypeEnum.number,
  DatasetCollectionTagTypeEnum.datetime,
  DatasetCollectionTagTypeEnum.array
] as const;

/** 工作流标签过滤支持的标签类型。string 只接受接口下发。 */
export const WorkflowTagFilterTagTypeSchema = z.enum([
  DatasetCollectionTagTypeEnum.string,
  ...UI_SUPPORTED_TAG_TYPES
] as const);
export type WorkflowTagFilterTagType = z.infer<typeof WorkflowTagFilterTagTypeSchema>;

export const DatasetTagFilterConditionSchema = z.object({
  field: z.enum(DatasetTagFilterFieldEnum).optional(),
  tag: z.string().optional(),
  tagType: WorkflowTagFilterTagTypeSchema.optional(),
  op: z.string().optional(),
  valueMode: z.enum(DatasetTagFilterValueModeEnum).optional(),
  value: z.unknown().optional()
});
export type DatasetTagFilterCondition = z.infer<typeof DatasetTagFilterConditionSchema>;

export const DatasetTagFilterValueSchema = z.object({
  logic: z.enum(DatasetTagFilterLogicEnum),
  conditions: z.array(DatasetTagFilterConditionSchema)
});
export type DatasetTagFilterValue = z.infer<typeof DatasetTagFilterValueSchema>;

export type WorkflowTagFilterOption = {
  tag: string;
  tagType: WorkflowTagFilterTagType;
  options: string[];
};

const emptyOps = new Set(emptyValueOperators.map((item) => item.value));

export const createEmptyTagFilterCondition = (): DatasetTagFilterCondition => ({
  tag: '',
  op: '',
  valueMode: DatasetTagFilterValueModeEnum.input,
  value: undefined
});

export const createEmptyTagFilterValue = (): DatasetTagFilterValue => ({
  logic: DatasetTagFilterLogicEnum.AND,
  conditions: [createEmptyTagFilterCondition()]
});

export const isWorkflowTagFilterTagType = (
  tagType?: DatasetCollectionTagType
): tagType is WorkflowTagFilterTagType => WorkflowTagFilterTagTypeSchema.safeParse(tagType).success;

/**
 * 判断节点/表单 value 是否为新版条件行结构。
 * 旧版 collectionFilterMatch 是 JSON 字符串（tags/createTime/collectionIds）。
 */
export const isDatasetTagFilterValue = (value: unknown): value is DatasetTagFilterValue => {
  return DatasetTagFilterValueSchema.safeParse(value).success;
};

/** 条件不需要右侧值输入（为空 / 不为空）。 */
export const isTagFilterOpWithoutValue = (op?: string) => !!op && emptyOps.has(op);

export const isTagFilterAttributeField = (field?: DatasetTagFilterField | string) =>
  field === DatasetTagFilterFieldEnum.createTime ||
  field === DatasetTagFilterFieldEnum.collectionId;

export const getTagFilterOpsByType = (tagType?: WorkflowTagFilterTagType) => {
  return tagType ? tagFilterOperators[tagType] : [];
};

/** 文件属性只暴露检索载荷能准确表达的操作符，其余字段按标签类型选择。 */
export const getTagFilterOpsByCondition = (condition: DatasetTagFilterCondition) => {
  if (condition.field === DatasetTagFilterFieldEnum.createTime) {
    return createTimeOperators;
  }
  if (condition.field === DatasetTagFilterFieldEnum.collectionId) {
    return collectionIdOperators;
  }
  return getTagFilterOpsByType(condition.tagType);
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

type TagConditionObject = Record<string, Record<string, unknown>>;

export const formatTagOptionKey = (tag: string, tagType: string) => `${tag}\0${tagType}`;

export const parseTagOptionKey = (value: string) => {
  const splitIndex = value.indexOf('\0');
  if (splitIndex < 0) return;
  return {
    tag: value.slice(0, splitIndex),
    tagType: value.slice(splitIndex + 1) as WorkflowTagFilterOption['tagType']
  };
};

/**
 * 多知识库标签下拉：各库 number/datetime/array 标签按「名称 + 类型」取交集。
 * 只在部分库出现、或同名不同类型的项不进入下拉。array 的 options 取并集去重。
 * string 只由接口下发，同样不进入下拉。
 */
export const intersectWorkflowTagOptions = (
  tagLists: Pick<DatasetTagType, 'tag' | 'tagType' | 'options' | 'fromMigration'>[][]
): WorkflowTagFilterOption[] => {
  if (tagLists.length === 0) return [];

  const datasetMaps = tagLists.map((list) => {
    const map = new Map<string, WorkflowTagFilterOption>();
    for (const item of list) {
      if (
        !isWorkflowTagFilterTagType(item.tagType) ||
        isInterfaceOnlyTagFilterTagType(item.tagType)
      ) {
        continue;
      }
      const key = formatTagOptionKey(item.tag, item.tagType);
      const prev = map.get(key);
      const options = Array.from(
        new Set([...(prev?.options ?? []), ...(item.options ?? []).filter(Boolean)])
      );
      map.set(key, { tag: item.tag, tagType: item.tagType, options });
    }
    return map;
  });

  const [firstMap, ...restMaps] = datasetMaps;
  if (!firstMap) return [];

  const result: WorkflowTagFilterOption[] = [];
  for (const [key, option] of firstMap) {
    if (!restMaps.every((item) => item.has(key))) continue;
    const mergedOptions = new Set(option.options);
    for (const item of restMaps) {
      const other = item.get(key);
      other?.options.forEach((value) => mergedOptions.add(value));
    }
    result.push({
      tag: option.tag,
      tagType: option.tagType,
      options: Array.from(mergedOptions)
    });
  }
  return result;
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

/** 条件行引用值是 `[nodeId, outputKey]`，不复用工作流 utils 以免 dataset ↔ workflow 循环依赖。 */
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
 * 运行时统一格式化 collectionFilterMatch 为检索 JSON 字符串。
 * 兼容处理表单 AST 结构、内嵌 $ref 的检索载荷（委托 adapter 解析）、以及历史字符串。
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

  // 2. 检索载荷结构：解内嵌 $ref；若未发生任何替换，原样返回原始字符串
  if (isDatasetSearchValue(parsed)) {
    const resolved = resolveSearchValueRefs(parsed, resolveReference);
    if (typeof value === 'string') return resolved === parsed ? value : JSON.stringify(resolved);
    return JSON.stringify(resolved);
  }

  // 3. 其它类型：字符串原样返回，对象 JSON 序列化，其余丢弃
  if (typeof value === 'string') return value;
  if (typeof value === 'object') return JSON.stringify(value);
  return undefined;
};

/**
 * 知识库变动时裁剪条件行：剔除不在新标签交集中的行。
 * 保留文件属性、未选择标签的空行以及接口下发的 string 条件行。
 */
export const pruneTagFilterConditions = (
  value: DatasetTagFilterValue,
  options: WorkflowTagFilterOption[]
): DatasetTagFilterValue => {
  const valid = new Set(options.map((item) => formatTagOptionKey(item.tag, item.tagType)));
  const conditions = value.conditions.filter((condition) => {
    if (isTagFilterAttributeField(condition.field) || !condition.tag) return true;
    if (isInterfaceOnlyTagFilterTagType(condition.tagType)) return true;
    return !!condition.tagType && valid.has(formatTagOptionKey(condition.tag, condition.tagType));
  });
  return {
    ...value,
    conditions: conditions.length > 0 ? conditions : [createEmptyTagFilterCondition()]
  };
};
