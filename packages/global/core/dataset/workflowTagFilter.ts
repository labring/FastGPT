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
 * 显式版本优先；存量节点缺少版本时，有过滤配置走 legacy，无配置直接使用 structured。
 * 这里只判断是否配置，不根据过滤值的字符串或对象形状推断版本。
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

/** 旧编辑器只接收字符串；异常存量值显示为空，不用于推断节点版本。 */
export const normalizeLegacyDatasetTagFilterValue = (value: unknown) =>
  typeof value === 'string' ? value : '';

/** 条件行字段来源：知识库标签，或固定文件属性。 */
export const DatasetTagFilterFieldEnum = {
  tag: 'tag',
  createTime: 'createTime',
  collectionId: 'collectionId'
} as const;
export type DatasetTagFilterField =
  (typeof DatasetTagFilterFieldEnum)[keyof typeof DatasetTagFilterFieldEnum];

/** 工作流标签过滤支持的标签类型。string 只接受接口下发。 */
const WorkflowTagFilterTagTypeSchema = z.enum([
  DatasetCollectionTagTypeEnum.string,
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
  // string 标签只能由接口下发，操作符与检索层 checkValue 的 string 分支对齐。
  [DatasetCollectionTagTypeEnum.string]: [
    { labelKey: 'workflow:tag_filter_op_is', value: '$eq' },
    { labelKey: 'workflow:tag_filter_op_is_not', value: '$ne' },
    { labelKey: 'workflow:tag_filter_op_contains', value: '$contains' },
    { labelKey: 'workflow:tag_filter_op_not_contains', value: '$notContains' },
    { labelKey: 'workflow:tag_filter_op_starts_with', value: '$startsWith' },
    { labelKey: 'workflow:tag_filter_op_ends_with', value: '$endsWith' },
    { labelKey: 'workflow:tag_filter_op_regex', value: '$regex' },
    ...emptyValueOperators
  ],
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
    { labelKey: 'workflow:tag_filter_op_contains', value: '$contains' },
    { labelKey: 'workflow:tag_filter_op_not_contains', value: '$notContains' },
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
 * 只由接口下发的标签类型：不进条件行下拉，界面也就没有入口创建它。
 * 因此界面也无权按「下拉候选」判断它是否还有效，剪枝时必须放行。
 */
export const isInterfaceOnlyTagFilterTagType = (tagType?: DatasetCollectionTagType) =>
  tagType === DatasetCollectionTagTypeEnum.string;

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
 * string 只由接口下发，同样不进入下拉。
 */
export const intersectWorkflowTagOptions = (
  tagLists: Pick<DatasetTagType, 'tag' | 'tagType' | 'options' | 'fromMigration'>[][]
): WorkflowTagFilterOption[] => {
  if (tagLists.length === 0) return [];

  const maps = tagLists.map((list) => {
    const map = new Map<string, WorkflowTagFilterOption>();
    for (const item of list) {
      if (!isWorkflowTagFilterTagType(item.tagType)) continue;
      if (isInterfaceOnlyTagFilterTagType(item.tagType)) continue;
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

/** JSON 字符串内的标签引用用 3 元组标记，与条件行的 2 元组 `[nodeId, outputKey]` 区分。 */
const REF_MARKER = '$ref';

const isEmbeddedRef = (value: unknown): value is [string, string, string] =>
  Array.isArray(value) &&
  value.length === 3 &&
  value[0] === REF_MARKER &&
  typeof value[1] === 'string' &&
  typeof value[2] === 'string';

/**
 * 检索载荷结构：顶层放文件属性，tags 下按逻辑词挂条件项数组。
 * `{ tags: { $and | $or: unknown[] }, createTime?, collectionIds? }`
 * 合法条件项是对象；历史字符串等非对象项由解引用层原样放回。
 */
type DatasetSearchValue = {
  tags?: { $and?: unknown[]; $or?: unknown[] };
};

/** 排除 null 与数组，只认普通对象。 */
const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/**
 * 把「检索载荷」和任意 JSON 区分开：只有它才走 $ref 解引用，其余值原样透传。
 */
const isDatasetSearchValue = (value: unknown): value is DatasetSearchValue => {
  if (!isPlainRecord(value)) return false;
  const tags = value.tags;
  if (tags === undefined) return true;
  if (!isPlainRecord(tags)) return false;
  return Object.entries(tags).every(
    ([logic, conditions]) => (logic === '$and' || logic === '$or') && Array.isArray(conditions)
  );
};

/**
 * 解一条条件项。
 * 条件项结构：`{ [tag]: { [$op]: 值 } }`，是对象不是字符串；
 * 只有「值」位上是 `['$ref', nodeId, outputId]` 才解成引用值，字符串等其它值直接放回。
 * 历史 JSON 里混进来的字符串等非对象项在这里原样放回。
 * 只在真有替换时重建对象，未变化时返回原引用，供上层判断要不要重新序列化。
 */
const resolveConditionRef = (
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
 * 解检索载荷里内嵌的 `['$ref', nodeId, outputId]`。
 *
 * 检索载荷结构：`{ tags: { $and | $or: 条件项[] }, createTime?, collectionIds? }`。
 * 条件项是对象 `{ [tag]: { [$op]: 值 } }`，引用只可能出现在「值」这一位上，
 * 项本身不是对象（含字符串）时原样放回，故只走 tags → 条件项 → 操作符值这一层，不做全树递归。
 *
 * 解不出值（或未注入 resolveReference）时保留原 `$ref`，避免产出检索层会拒绝的残缺条件对象。
 * 一处都没解到时返回入参本身（引用相等），调用方据此决定要不要重新序列化：
 * 字符串输入没变就原样返回，不去重排用户原来的 JSON 文本。
 */
const resolveSearchValueRefs = (
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

/**
 * 运行时把 collectionFilterMatch 统一成检索 JSON 字符串。
 * 输入可能是条件行结构、检索载荷 JSON（字符串或对象）、或历史遗留的普通字符串。
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

  // 条件行结构（编辑器表单值）：{ logic, conditions: [{ tag, tagType, op, value, valueMode }] }
  // 条件行 valueMode 为 reference 时 value 是 2 元组 [nodeId, outputKey]，解完序列化成检索 JSON
  if (structured) {
    const resolved: DatasetTagFilterValue = {
      logic: structured.logic,
      conditions: structured.conditions.map((condition) =>
        resolveConditionValue(condition, resolveReference)
      )
    };
    return serializeDatasetTagFilterValue(resolved);
  }

  // 检索载荷结构：{ tags: { $and | $or: [{ [tag]: { [$op]: 值 } }] }, createTime?, collectionIds? }
  // 条件项是对象，值上的 $ref 才解；字符串输入若一处都没解到，原样返回它本身
  if (isDatasetSearchValue(parsed)) {
    const resolved = resolveSearchValueRefs(parsed, resolveReference);
    if (typeof value === 'string') return resolved === parsed ? value : JSON.stringify(resolved);
    return JSON.stringify(resolved);
  }

  // 两种结构都不是：字符串原样返回，对象保持 JSON 化，其它原始值丢弃
  if (typeof value === 'string') return value;
  if (typeof value === 'object') return JSON.stringify(value);
  return undefined;
};

/**
 * 已选库变化后，丢掉不在新交集里的标签行。
 * 文件属性、尚未选择字段的空行、以及接口下发的 string 行都保留，
 * 否则「添加过滤条件」会被立刻清掉，外部配置会被界面悄悄删掉。
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
