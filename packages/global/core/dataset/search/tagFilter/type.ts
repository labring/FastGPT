import { z } from 'zod';
import { JsonValueOpenApiMeta } from '../../../../common/zod/openapi';
import { DatasetCollectionTagTypeEnum } from '../../constants';
import type { DatasetCollectionTagType } from '../../type';

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

/** 标签过滤支持的标签类型。string 只接受接口下发。 */
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
  value: z
    .unknown()
    .optional()
    .meta({ ...JsonValueOpenApiMeta, description: '筛选值' })
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

/** 原始检索载荷结构：顶层包含 tags、createTime、collectionIds 等过滤条件。 */
export type DatasetSearchValue = {
  tags?: { $and?: unknown[]; $or?: unknown[] };
  createTime?: { $gte?: string; $lte?: string };
  collectionIds?: string[];
  [key: string]: unknown;
};

export type TagConditionObject = Record<string, Record<string, unknown>>;

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

/** 判断节点/表单 value 是否为新版条件行结构。 */
export const isDatasetTagFilterValue = (value: unknown): value is DatasetTagFilterValue => {
  return DatasetTagFilterValueSchema.safeParse(value).success;
};
