import z from 'zod';
import {
  DatasetCollectionTagTypeEnum,
  CollectionTagValueSchema,
  CollectionTagValueFieldSchema,
  DatasetCollectionTagOptionsSchema
} from '../../../../core/dataset/type';

export const BatchCollectionTagModeEnum = {
  add: 'add',
  remove: 'remove'
} as const;
export const BatchCollectionTagModeSchema = z.enum([
  BatchCollectionTagModeEnum.add,
  BatchCollectionTagModeEnum.remove
]);

/* ============================================================================
 * API: 创建集合标签
 * Route: POST /proApi/core/dataset/tag/create
 * ============================================================================ */
export const CreateDatasetCollectionTagBodySchema = z.object({
  datasetId: z.string().meta({ description: '数据集 ID' }),
  tag: z.string().trim().min(1).meta({ description: '标签名称' }),
  tagType: z.enum(DatasetCollectionTagTypeEnum).optional().meta({
    description: '标签类型：string(默认)/number/datetime/array'
  })
});
export type CreateDatasetCollectionTagParams = z.infer<typeof CreateDatasetCollectionTagBodySchema>;

/* ============================================================================
 * API: 批量为集合添加标签
 * Route: POST /proApi/core/dataset/tag/addToCollections
 * ============================================================================ */
export const AddTagsToCollectionsBodySchema = z.object({
  originCollectionIds: z
    .array(z.string())
    .meta({ description: '来源集合 ID 列表（用于复制标签）' }),
  collectionIds: z.array(z.string()).meta({ description: '目标集合 ID 列表' }),
  datasetId: z.string().meta({ description: '数据集 ID' }),
  tag: z.string().trim().meta({ description: '标签名称' }),
  value: z.string().optional().meta({ description: '标签值（仅 string 类型标签支持）' })
});
export type AddTagsToCollectionsParams = z.infer<typeof AddTagsToCollectionsBodySchema>;

/* ============================================================================
 * API: 更新集合标签
 * Route: POST /proApi/core/dataset/tag/update
 * ============================================================================ */
export const UpdateDatasetCollectionTagBodySchema = z.object({
  datasetId: z.string().meta({ description: '数据集 ID' }),
  tagId: z.string().meta({ description: '标签 ID' }),
  tag: z.string().trim().min(1).meta({ description: '新标签名称' }),
  options: DatasetCollectionTagOptionsSchema.optional().meta({
    description: '选项类标签的预设选项，传入时覆盖原有选项'
  })
});
export type UpdateDatasetCollectionTagParams = z.infer<typeof UpdateDatasetCollectionTagBodySchema>;

/* ============================================================================
 * API: 删除集合标签
 * Route: DELETE /proApi/core/dataset/tag/delete
 * ============================================================================ */
export const DeleteDatasetCollectionTagQuerySchema = z.object({
  datasetId: z.string().meta({ description: '数据集 ID' }),
  id: z.string().meta({ description: '标签 ID' })
});
export type DeleteDatasetCollectionTagQuery = z.infer<typeof DeleteDatasetCollectionTagQuerySchema>;

/* ============================================================================
 * API: 获取知识库全部标签
 * Route: GET /proApi/core/dataset/tag/getAllTags
 * ============================================================================ */
export const GetAllDatasetTagsQuerySchema = z.object({
  datasetId: z.string().meta({ description: '数据集 ID' })
});
export type GetAllDatasetTagsQuery = z.infer<typeof GetAllDatasetTagsQuerySchema>;

/* ============================================================================
 * API: 批量 Upsert 标签
 * Route: POST /proApi/core/dataset/tag/batchUpsert
 * ============================================================================ */
export const BatchUpsertTagItemSchema = z.object({
  tag: z.string().trim().min(1).meta({ description: '标签名称' }),
  tagType: z.enum(DatasetCollectionTagTypeEnum).optional().meta({ description: '标签类型' })
});
export const BatchUpsertTagsBodySchema = z.object({
  datasetId: z.string().meta({ description: '数据集 ID' }),
  tags: z.array(BatchUpsertTagItemSchema).min(1).meta({ description: '标签列表' })
});
export type BatchUpsertTagsParams = z.infer<typeof BatchUpsertTagsBodySchema>;

/* ============================================================================
 * API: 设置单个 Collection 标签值
 * Route: POST /proApi/core/dataset/tag/setCollectionTags
 * ============================================================================ */
export const SetCollectionTagsBodySchema = z.object({
  datasetId: z.string().meta({ description: '数据集 ID' }),
  collectionId: z.string().meta({ description: '集合 ID' }),
  tags: z.array(CollectionTagValueSchema).meta({ description: '标签值列表' })
});
export type SetCollectionTagsParams = z.infer<typeof SetCollectionTagsBodySchema>;

/* ============================================================================
 * API: 批量设置 Collection 标签值
 * Route: POST /proApi/core/dataset/tag/batchSetCollectionTags
 * ============================================================================ */
export const BatchSetCollectionTagItemSchema = z.object({
  tagId: z.string().meta({ description: '引用 dataset_collection_tags_v2._id' }),
  value: CollectionTagValueFieldSchema.optional().meta({
    description: 'add：必填标签值。remove：省略则移除整个标签；array 传入 string[] 时只移除这些选项'
  }),
  append: z.boolean().optional().meta({
    description: '仅 number 类型的 add 生效：true 时把值累加到已有数字，缺省或 false 为覆盖'
  })
});
export type BatchSetCollectionTagItem = z.infer<typeof BatchSetCollectionTagItemSchema>;

export const BatchSetCollectionTagsBodySchema = z.object({
  datasetId: z.string().meta({ description: '数据集 ID' }),
  collectionIds: z.array(z.string()).min(1).meta({ description: '集合 ID 列表' }),
  mode: BatchCollectionTagModeSchema.default(BatchCollectionTagModeEnum.add).meta({
    description: 'add：批量添加/覆盖标签；remove：批量移除标签或选项值'
  }),
  tags: z.array(BatchSetCollectionTagItemSchema).meta({ description: '标签操作列表' })
});
export type BatchSetCollectionTagsParams = z.infer<typeof BatchSetCollectionTagsBodySchema>;
