import { z } from 'zod';
import { JsonValueOpenApiMeta } from '../../../../common/zod/openapi';
import {
  DatasetCollectionTagTypeEnum,
  DatasetTagFilterFieldEnum,
  DatasetTagFilterLogicEnum,
  DatasetTagFilterValueModeEnum,
  DatasetTagFilterVersionEnum,
  UI_SUPPORTED_TAG_TYPES
} from '../../constants';
import type { DatasetCollectionTagType } from '../../type';

export type DatasetTagFilterValueMode =
  (typeof DatasetTagFilterValueModeEnum)[keyof typeof DatasetTagFilterValueModeEnum];

export type DatasetTagFilterField =
  (typeof DatasetTagFilterFieldEnum)[keyof typeof DatasetTagFilterFieldEnum];

export const DatasetTagFilterVersionSchema = z.enum(DatasetTagFilterVersionEnum);
export type DatasetTagFilterVersion = z.infer<typeof DatasetTagFilterVersionSchema>;

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
