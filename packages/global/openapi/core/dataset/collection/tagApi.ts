import z from 'zod';

/* ============================================================================
 * API: 创建集合标签
 * Route: POST /proApi/core/dataset/tag/create
 * ============================================================================ */
export const CreateDatasetCollectionTagBodySchema = z.object({
  datasetId: z.string().meta({ description: '数据集 ID' }),
  tag: z.string().meta({ description: '标签名称' })
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
  tag: z.string().meta({ description: '标签名称' })
});
export type AddTagsToCollectionsParams = z.infer<typeof AddTagsToCollectionsBodySchema>;

/* ============================================================================
 * API: 更新集合标签
 * Route: POST /proApi/core/dataset/tag/update
 * ============================================================================ */
export const UpdateDatasetCollectionTagBodySchema = z.object({
  datasetId: z.string().meta({ description: '数据集 ID' }),
  tagId: z.string().meta({ description: '标签 ID' }),
  tag: z.string().meta({ description: '新标签名称' })
});
export type UpdateDatasetCollectionTagParams = z.infer<typeof UpdateDatasetCollectionTagBodySchema>;
