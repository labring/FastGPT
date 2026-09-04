import { z } from 'zod';
import { formatTime2YMDHM } from '../../common/string/time';
import { DatasetCollectionTagTypeEnum } from './constants';
import type { DatasetCollectionTagType, DatasetTagType } from './type';

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

/** 条件行字段来源：知识库标签，或固定文件属性。 */
export const DatasetTagFilterFieldEnum = {
  tag: 'tag',
  createTime: 'createTime',
  collectionId: 'collectionId'
} as const;
export type DatasetTagFilterField =
  (typeof DatasetTagFilterFieldEnum)[keyof typeof DatasetTagFilterFieldEnum];

/** 工作流标签过滤支持的标签类型。string 不进入条件行下拉。 */
const WorkflowTagFilterTagTypeSchema = z.enum([
  DatasetCollectionTagTypeEnum.number,
  DatasetCollectionTagTypeEnum.datetime,
  DatasetCollectionTagTypeEnum.array
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

type TagFilterOperator = {
  labelKey: string;
  value: string;
  icon?: string;
  iconFlip?: boolean;
};

const emptyValueOperators: TagFilterOperator[] = [
  { labelKey: 'workflow:tag_filter_op_empty', value: '$empty' },
  { labelKey: 'workflow:tag_filter_op_not_empty', value: '$notEmpty' }
];
const emptyOps = new Set(emptyValueOperators.map((item) => item.value));

const tagFilterOperators: Record<WorkflowTagFilterTagType, TagFilterOperator[]> = {
  [DatasetCollectionTagTypeEnum.number]: [
    { labelKey: 'workflow:tag_filter_op_eq', value: '$eq', icon: 'math/equal' },
    { labelKey: 'workflow:tag_filter_op_ne', value: '$ne', icon: 'math/notEqual' },
    { labelKey: 'workflow:tag_filter_op_gt', value: '$gt', icon: 'math/greater' },
    { labelKey: 'workflow:tag_filter_op_lt', value: '$lt', icon: 'math/greater', iconFlip: true },
    { labelKey: 'workflow:tag_filter_op_gte', value: '$gte', icon: 'math/greaterEqual' },
    {
      labelKey: 'workflow:tag_filter_op_lte',
      value: '$lte',
      icon: 'math/greaterEqual',
      iconFlip: true
    },
    ...emptyValueOperators
  ],
  [DatasetCollectionTagTypeEnum.datetime]: [
    { labelKey: 'workflow:tag_filter_op_is', value: '$eq' },
    { labelKey: 'workflow:tag_filter_op_is_not', value: '$ne' },
    { labelKey: 'workflow:tag_filter_op_after', value: '$gt' },
    { labelKey: 'workflow:tag_filter_op_before', value: '$lt' },
    ...emptyValueOperators
  ],
  [DatasetCollectionTagTypeEnum.array]: [
    { labelKey: 'workflow:tag_filter_op_is', value: '$is' },
    { labelKey: 'workflow:tag_filter_op_is_not', value: '$isNot' },
    { labelKey: 'workflow:tag_filter_op_in', value: '$in' },
    { labelKey: 'workflow:tag_filter_op_not_in', value: '$notIn' },
    ...emptyValueOperators
  ]
};

const createTimeOperators = tagFilterOperators[DatasetCollectionTagTypeEnum.number].filter(
  (item) => item.value === '$gte' || item.value === '$lte'
);
const collectionIdOperators = tagFilterOperators[DatasetCollectionTagTypeEnum.array].filter(
  (item) => item.value === '$in'
);

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

const parseMaybeJson = (value: unknown): unknown => {
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
 */
export const intersectWorkflowTagOptions = (
  tagLists: Pick<DatasetTagType, 'tag' | 'tagType' | 'options'>[][]
): WorkflowTagFilterOption[] => {
  if (tagLists.length === 0) return [];

  const maps = tagLists.map((list) => {
    const map = new Map<string, WorkflowTagFilterOption>();
    for (const item of list) {
      if (!isWorkflowTagFilterTagType(item.tagType)) continue;
      const key = formatTagOptionKey(item.tag, item.tagType);
      const prev = map.get(key);
      const options = Array.from(
        new Set([...(prev?.options ?? []), ...(item.options ?? []).filter(Boolean)])
      );
      map.set(key, { tag: item.tag, tagType: item.tagType, options });
    }
    return map;
  });

  const [first, ...rest] = maps;
  if (!first) return [];

  const result: WorkflowTagFilterOption[] = [];
  for (const [key, option] of first) {
    if (!rest.every((item) => item.has(key))) continue;
    const mergedOptions = new Set(option.options);
    for (const item of rest) {
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
  if (condition.value === undefined || condition.value === null || condition.value === '') {
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

/**
 * 把条件行编成检索入口 JSON：tags + 可选 createTime / collectionIds。
 * logic 只作用于 tags；文件属性在检索协议中是顶层约束，始终与标签结果求交集。
 * 创建时间多行按更严的 $gte/$lte 合并，Collection ID 多行合并为一个去重白名单。
 * 未填完的行会被丢掉；没有任何有效字段时返回 undefined。
 */
export const serializeDatasetTagFilterValue = (
  value: DatasetTagFilterValue
): string | undefined => {
  const tagConditions = value.conditions
    .map(buildTagConditionObject)
    .filter((item): item is TagConditionObject => Boolean(item));

  const createTime: { $gte?: string; $lte?: string } = {};
  for (const condition of value.conditions) {
    if (condition.field !== DatasetTagFilterFieldEnum.createTime || !condition.op) continue;
    const time = toCreateTimeString(condition.value);
    if (!time) continue;
    if (condition.op === '$gte') {
      if (!createTime.$gte || time > createTime.$gte) createTime.$gte = time;
      continue;
    }
    if (condition.op === '$lte') {
      if (!createTime.$lte || time < createTime.$lte) createTime.$lte = time;
    }
  }

  const idLists = value.conditions
    .filter(
      (condition) =>
        condition.field === DatasetTagFilterFieldEnum.collectionId && condition.op === '$in'
    )
    .map((condition) => toIdList(condition.value))
    .filter((list) => list.length > 0);
  const collectionIds = [...new Set(idLists.flat())];

  const payload: Record<string, unknown> = {};
  if (tagConditions.length > 0) {
    const key = value.logic === DatasetTagFilterLogicEnum.OR ? '$or' : '$and';
    payload.tags = { [key]: tagConditions };
  }
  if (createTime.$gte || createTime.$lte) {
    payload.createTime = createTime;
  }
  if (collectionIds.length > 0) {
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
 * 运行时把 collectionFilterMatch 统一成检索 JSON 字符串。
 * 整段引用、旧 JSON 字符串原样（或解析后若是条件行再序列化）；条件行会先解析行内引用。
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

  if (structured) {
    const resolved: DatasetTagFilterValue = {
      logic: structured.logic,
      conditions: structured.conditions.map((condition) =>
        resolveConditionValue(condition, resolveReference)
      )
    };
    return serializeDatasetTagFilterValue(resolved);
  }

  if (typeof value === 'string') return value;
  if (typeof value === 'object') return JSON.stringify(value);
  return undefined;
};

/**
 * 已选库变化后，丢掉不在新交集里的标签行。
 * 文件属性和尚未选择字段的空行都保留，否则「添加过滤条件」会被立刻清掉。
 */
export const pruneTagFilterConditions = (
  value: DatasetTagFilterValue,
  options: WorkflowTagFilterOption[]
): DatasetTagFilterValue => {
  const valid = new Set(options.map((item) => formatTagOptionKey(item.tag, item.tagType)));
  const conditions = value.conditions.filter((condition) => {
    if (isTagFilterAttributeField(condition.field) || !condition.tag) return true;
    return !!condition.tagType && valid.has(formatTagOptionKey(condition.tag, condition.tagType));
  });
  return {
    ...value,
    conditions: conditions.length > 0 ? conditions : [createEmptyTagFilterCondition()]
  };
};
