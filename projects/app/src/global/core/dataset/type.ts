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
