import {
  DatasetCollectionTagTypeEnum,
  DatasetTagFilterFieldEnum,
  tagFilterOperators,
  createTimeOperators,
  collectionIdOperators,
  emptyValueOperators
} from '../../constants';
import type { DatasetCollectionTagType, DatasetTagType } from '../../type';
import {
  type DatasetTagFilterField,
  type DatasetTagFilterCondition,
  type DatasetTagFilterValue,
  type WorkflowTagFilterOption,
  type WorkflowTagFilterTagType,
  createEmptyTagFilterCondition,
  isWorkflowTagFilterTagType
} from './type';

const emptyOps = new Set(emptyValueOperators.map((item) => item.value));

/** 只由外部接口/适配下发的标签类型：不进条件行下拉，界面无入口创建。 */
export const isInterfaceOnlyTagFilterTagType = (tagType?: DatasetCollectionTagType) =>
  tagType === DatasetCollectionTagTypeEnum.string;

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
