import {
  GetPathPropsSchema,
  ParentIdSchema,
  ParentTreePathItemSchema
} from '../../../../common/parentFolder/type';
import { ObjectIdSchema } from '../../../../common/type/mongo';
import { OutLinkChatAuthSchema } from '../../../../support/permission/chat';
import {
  DatasetCollectionSyncResultEnum,
  DatasetCollectionTypeEnum,
  DatasetCollectionDataProcessModeEnum,
  TrainingModeEnum
} from '../../../../core/dataset/constants';
import {
  ChunkSettingsSchema,
  DatasetCollectionItemSchema,
  DatasetCollectionSchema
} from '../../../../core/dataset/type';
import { PermissionSchema } from '../../../../support/permission/controller';
import { PaginationResponseSchema, PaginationSchema } from '../../../api';
import z from 'zod';

// ============= Scroll Collections =============
export const ScrollCollectionsBodySchema = z.object({
  datasetId: z.string(),
  parentId: z.string().nullable().optional().default(null),
  searchText: z.string().optional().default(''),
  selectFolder: z.boolean().optional().default(false),
  filterTags: z.array(z.string()).optional().default([]),
  simple: z.boolean().optional().default(false)
});
export type ScrollCollectionsBodyType = z.infer<typeof ScrollCollectionsBodySchema>;

// ============= Update Collection =============
export const UpdateDatasetCollectionBodySchema = z.object({
  id: ObjectIdSchema.optional().describe('集合ID，与 datasetId+externalFileId 二选一'),
  parentId: ParentIdSchema.describe('父级目录ID'),
  name: z.string().optional().describe('集合名称'),
  tags: z.array(z.string()).optional().describe('标签列表（标签名称，非ID）'),
  forbid: z.boolean().optional().describe('是否禁用'),
  createTime: z.coerce.date().optional().describe('创建时间'),
  datasetId: z.string().optional().describe('数据集ID，配合 externalFileId 使用'),
  externalFileId: z.string().optional().describe('外部文件ID，配合 datasetId 使用')
});
export type UpdateDatasetCollectionBodyType = z.infer<typeof UpdateDatasetCollectionBodySchema>;

// ============= Export Collection =============
// Schema 1: Basic collection export with authentication
const BasicExportSchema = z
  .object({
    collectionId: ObjectIdSchema.describe('集合ID')
  })
  .meta({
    description: '通过身份鉴权导出集合',
    example: {
      collectionId: '1234567890'
    }
  });

// Schema 2: Export from chat context with outlink authentication
const ChatExportSchema = OutLinkChatAuthSchema.extend({
  collectionId: ObjectIdSchema.describe('集合ID'),
  appId: ObjectIdSchema.describe('应用ID'),
  chatId: ObjectIdSchema.describe('会话ID'),
  chatItemDataId: z.string().describe('对话ID'),
  chatTime: z.coerce.date().optional().describe('对话时间')
}).meta({
  description: '对话中导出集合，可通过 chatId 等身份信息',
  example: {
    collectionId: '1234567890',
    appId: '1234567890',
    chatId: '1234567890',
    chatItemDataId: '1234567890',
    chatTime: '2025-12-30T00:00:00.000Z',
    shareId: '1234567890',
    outLinkUid: '1234567890'
  }
});

export const ExportCollectionBodySchema = z.union([BasicExportSchema, ChatExportSchema]);
export type ExportCollectionBodyType = z.infer<typeof ExportCollectionBodySchema>;

// ============= Delete Collection =============
export const DeleteCollectionQuerySchema = z.object({
  id: z.string().optional().meta({ description: '单个集合 ID（与 body.collectionIds 二选一）' })
});
export type DeleteCollectionQueryType = z.infer<typeof DeleteCollectionQuerySchema>;

export const DeleteCollectionBodySchema = z.object({
  collectionIds: z.array(z.string()).optional().meta({ description: '集合 ID 列表' })
});
export type DeleteCollectionBodyType = z.infer<typeof DeleteCollectionBodySchema>;

// ============= Get Collection Detail =============
export const GetCollectionDetailQuerySchema = z.object({
  id: z.string().meta({ description: '集合 ID' })
});
export type GetCollectionDetailQueryType = z.infer<typeof GetCollectionDetailQuerySchema>;

export const GetCollectionDetailResponseSchema = DatasetCollectionItemSchema.meta({
  description: '集合详情'
});
export type GetCollectionDetailResponseType = z.infer<typeof GetCollectionDetailResponseSchema>;

// ============= List Collections V2 =============
export const ListCollectionV2BodySchema = PaginationSchema.extend({
  datasetId: z.string().meta({ description: '数据集 ID' }),
  parentId: z.string().nullable().optional().default(null).meta({ description: '父级目录 ID' }),
  searchText: z.string().max(100).optional().default('').meta({ description: '搜索文本' }),
  selectFolder: z.boolean().optional().default(false).meta({ description: '只返回文件夹' }),
  filterTags: z.array(z.string()).optional().default([]).meta({ description: '过滤标签' }),
  simple: z.boolean().optional().default(false).meta({ description: '简单模式（不统计数量）' })
});
export type ListCollectionV2BodyType = z.infer<typeof ListCollectionV2BodySchema>;

// ============= List Collections V2 Response =============
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
export const ListCollectionV2ResponseSchema = PaginationResponseSchema(
  DatasetCollectionsListItemSchema
);
export type ListCollectionV2ResponseType = z.infer<typeof ListCollectionV2ResponseSchema>;

// ============= Get Collection Paths =============
export const GetCollectionPathsQuerySchema = GetPathPropsSchema;
export type GetCollectionPathsQueryType = z.infer<typeof GetCollectionPathsQuerySchema>;

export const GetCollectionPathsResponseSchema = z.array(ParentTreePathItemSchema);
export type GetCollectionPathsResponseType = z.infer<typeof GetCollectionPathsResponseSchema>;

// ============= Read Collection Source =============
export const ReadCollectionSourceBodySchema = OutLinkChatAuthSchema.extend({
  collectionId: ObjectIdSchema.meta({ description: '集合 ID' }),
  appId: ObjectIdSchema.optional().meta({ description: '应用 ID（对话中使用）' }),
  chatId: z.string().min(1).optional().meta({ description: '对话 ID（对话中使用）' }),
  chatItemDataId: z.string().min(1).optional().meta({ description: '对话消息 ID（对话中使用）' })
});
export type ReadCollectionSourceBodyType = z.infer<typeof ReadCollectionSourceBodySchema>;

export const ReadCollectionSourceResponseSchema = z.object({
  type: z.literal('url').meta({ description: '资源类型' }),
  value: z.string().meta({ description: '资源 URL' })
});
export type ReadCollectionSourceResponseType = z.infer<typeof ReadCollectionSourceResponseSchema>;

// ============= Training Detail =============
export const GetCollectionTrainingDetailQuerySchema = z.object({
  collectionId: z.string().meta({ description: '集合 ID' })
});
export type GetCollectionTrainingDetailQueryType = z.infer<
  typeof GetCollectionTrainingDetailQuerySchema
>;

const TrainingCountsSchema = z
  .record(z.enum(TrainingModeEnum), z.number())
  .meta({ description: '各训练模式数量' });

export const GetCollectionTrainingDetailResponseSchema = z.object({
  trainingType: z
    .enum(DatasetCollectionDataProcessModeEnum)
    .optional()
    .meta({ description: '训练类型' }),
  advancedTraining: z
    .object({
      customPdfParse: z.boolean().meta({ description: '自定义 PDF 解析' }),
      imageIndex: z.boolean().meta({ description: '图片索引' }),
      autoIndexes: z.boolean().meta({ description: '自动索引' })
    })
    .meta({ description: '高级训练配置' }),
  queuedCounts: TrainingCountsSchema.meta({ description: '排队中数量' }),
  trainingCounts: TrainingCountsSchema.meta({ description: '训练中数量' }),
  errorCounts: TrainingCountsSchema.meta({ description: '错误数量' }),
  trainedCount: z.number().meta({ description: '已训练数据量' })
});
export type GetCollectionTrainingDetailResponseType = z.infer<
  typeof GetCollectionTrainingDetailResponseSchema
>;

// ============= Sync Collection =============
export const SyncCollectionBodySchema = z.object({
  collectionId: ObjectIdSchema.meta({ description: '集合 ID' })
});
export type SyncCollectionBodyType = z.infer<typeof SyncCollectionBodySchema>;

export const SyncCollectionResponseSchema = z.enum(DatasetCollectionSyncResultEnum).meta({
  description: '同步结果'
});
export type SyncCollectionResponseType = z.infer<typeof SyncCollectionResponseSchema>;
