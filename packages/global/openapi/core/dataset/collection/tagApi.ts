import z from 'zod';
import { ObjectIdSchema } from '../../../../common/type/mongo';

/* ============================================================================
 * API: 创建集合标签
 * Route: POST /proApi/core/dataset/tag/create
 * ============================================================================ */
export const CreateDatasetCollectionTagBodySchema = z.object({
  datasetId: ObjectIdSchema.meta({ description: '数据集 ID' }),
  tag: z.string().meta({ description: '标签名称' }),
  tagType: z.string().optional().meta({ description: '标签类型' })
});
export type CreateDatasetCollectionTagParams = z.infer<typeof CreateDatasetCollectionTagBodySchema>;

/* ============================================================================
 * API: 批量为集合添加标签
 * Route: POST /proApi/core/dataset/tag/addToCollections
 * ============================================================================ */
export const AddTagsToCollectionsBodySchema = z.object({
  originCollectionIds: z
    .array(ObjectIdSchema)
    .meta({ description: '来源集合 ID 列表（用于复制标签）' }),
  collectionIds: z.array(ObjectIdSchema).meta({ description: '目标集合 ID 列表' }),
  datasetId: ObjectIdSchema.meta({ description: '数据集 ID' }),
  tag: z.string().meta({ description: '标签名称' })
});
export type AddTagsToCollectionsParams = z.infer<typeof AddTagsToCollectionsBodySchema>;

/* ============================================================================
 * API: 更新集合标签
 * Route: POST /proApi/core/dataset/tag/update
 * ============================================================================ */
export const UpdateDatasetCollectionTagBodySchema = z.object({
  datasetId: ObjectIdSchema.meta({ description: '数据集 ID' }),
  tagId: ObjectIdSchema.meta({ description: '标签 ID' }),
  tag: z.string().meta({ description: '新标签名称' }),
  tagType: z.string().optional().meta({ description: '标签类型' })
});
export type UpdateDatasetCollectionTagParams = z.infer<typeof UpdateDatasetCollectionTagBodySchema>;

/* ============================================================================
 * API: 批量新增/修改标签
 * Route: POST /proApi/core/dataset/tag/batchUpsert
 * ============================================================================ */
export const BatchUpsertTagsBodySchema = z
  .object({
    datasetId: ObjectIdSchema.meta({ description: '数据集 ID' }),
    tags: z
      .array(
        z.object({
          tag: z.string().meta({ description: '标签名称' }),
          tagType: z.enum(['string', 'number', 'datetime']).optional().meta({
            description: '标签类型: string=文本, number=数字, datetime=日期时间'
          })
        })
      )
      .min(1)
      .meta({ description: '标签数组' })
  })
  .refine(
    (data) => {
      const tagNames = data.tags.map((t) => t.tag);
      return new Set(tagNames).size === tagNames.length;
    },
    {
      message: '标签名不能重复',
      path: ['tags']
    }
  );
export type BatchUpsertTagsParams = z.infer<typeof BatchUpsertTagsBodySchema>;

/* ============================================================================
 * API: 设置集合的标签值
 * Route: POST /proApi/core/dataset/tag/setCollectionTags
 * ============================================================================ */
export const SetCollectionTagsBodySchema = z.object({
  collectionId: ObjectIdSchema.meta({ description: '集合 ID' }),
  tags: z
    .array(
      z.object({
        tagId: ObjectIdSchema.meta({ description: '标签 ID（引用标签服务中的 _id）' }),
        value: z
          .union([z.string(), z.number()])
          .meta({ description: '标签值，string 类型存字符串，datetime 类型存 UTC 毫秒时间戳' }),
        label: z.string().optional().meta({ description: '标签显示名称（服务端列表返回时附加）' })
      })
    )
    .optional()
    .meta({ description: '标签值列表' })
});
export type SetCollectionTagsParams = z.infer<typeof SetCollectionTagsBodySchema>;

/* ============================================================================
 * API: 批量设置集合的标签值
 * Route: POST /proApi/core/dataset/tag/batchSetCollectionTags
 * ============================================================================ */
export const BatchSetCollectionTagsBodySchema = z.object({
  collectionIds: z.array(ObjectIdSchema).min(1).meta({ description: '集合 ID 列表' }),
  tags: z
    .array(
      z.object({
        tagId: ObjectIdSchema.meta({ description: '标签 ID（引用标签服务中的 _id）' }),
        value: z
          .union([z.string(), z.number()])
          .meta({ description: '标签值，string 类型存字符串，datetime 类型存 UTC 毫秒时间戳' }),
        label: z.string().optional().meta({ description: '标签显示名称（服务端列表返回时附加）' })
      })
    )
    .optional()
    .meta({ description: '标签值列表' }),
  deleteTagIds: z.array(ObjectIdSchema).optional().meta({ description: '需要删除的标签 ID 列表' }),
  datasetId: ObjectIdSchema.meta({ description: '数据集 ID' })
});
export type BatchSetCollectionTagsParams = z.infer<typeof BatchSetCollectionTagsBodySchema>;

/* ============================================================================
 * API: 查询标签使用情况
 * Route: GET /proApi/core/dataset/tag/tagUsage
 * ============================================================================ */
export const GetTagUsageQuerySchema = z.object({
  datasetId: ObjectIdSchema.meta({ description: '数据集 ID' })
});
export type GetTagUsageQuery = z.infer<typeof GetTagUsageQuerySchema>;

export const GetTagUsageResponseSchema = z.array(
  z.object({
    tagId: ObjectIdSchema.meta({ description: '标签 ID' }),
    collections: z.array(ObjectIdSchema).meta({ description: '使用该标签的集合 ID 列表' })
  })
);
export type GetTagUsageResponse = z.infer<typeof GetTagUsageResponseSchema>;
