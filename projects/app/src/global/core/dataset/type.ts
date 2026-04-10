import { ObjectIdSchema } from '@fastgpt/global/common/type/mongo';
import { DatasetCollectionSchema } from '@fastgpt/global/core/dataset/type';
import { PermissionSchema } from '@fastgpt/global/support/permission/controller';
import { DatasetPermission } from '@fastgpt/global/support/permission/dataset/controller';
import z from 'zod';

/* ================= collection ===================== */
export const DatasetCollectionsListItemSchema = z.object({
  _id: ObjectIdSchema.meta({ description: '集合 ID' }),
  parentId: DatasetCollectionSchema.shape.parentId,
  tmbId: DatasetCollectionSchema.shape.tmbId,
  name: DatasetCollectionSchema.shape.name,
  type: DatasetCollectionSchema.shape.type,
  createTime: DatasetCollectionSchema.shape.createTime,
  updateTime: DatasetCollectionSchema.shape.updateTime,
  forbid: DatasetCollectionSchema.shape.forbid,
  trainingType: DatasetCollectionSchema.shape.trainingType,
  tags: z.array(z.string()).optional().meta({ description: '标签' }),

  externalFileId: z.string().optional().meta({ description: '外部文件 ID' }),

  fileId: z.string().optional().meta({ description: '文件 ID' }),
  rawLink: z.string().optional().meta({ description: '原始链接' }),
  permission: PermissionSchema,
  dataAmount: z.number().meta({ description: '数据数量' }),
  trainingAmount: z.number().meta({ description: '训练数量' }),
  hasError: z.boolean().optional().meta({ description: '是否错误' })
});
export type DatasetCollectionsListItemType = z.infer<typeof DatasetCollectionsListItemSchema>;

/* ================= data ===================== */
export const DatasetDataListItemSchema = z.object({
  _id: ObjectIdSchema.meta({ description: '数据 ID' }),
  datasetId: ObjectIdSchema.meta({ description: '数据集 ID' }),
  collectionId: ObjectIdSchema.meta({ description: '集合 ID' }),
  q: z.string().optional().meta({ description: '问题' }),
  a: z.string().optional().meta({ description: '答案' }),
  imageId: z.string().optional().meta({ description: '图片 ID' }),
  imageSize: z.number().optional().meta({ description: '图片大小' }),
  imagePreviewUrl: z.string().optional().meta({ description: '图片预览 URL' }),
  chunkIndex: z.number().optional().meta({ description: '块索引' }),
  updated: z.boolean().optional().meta({ description: '是否更新' })
});
export type DatasetDataListItemType = z.infer<typeof DatasetDataListItemSchema>;
