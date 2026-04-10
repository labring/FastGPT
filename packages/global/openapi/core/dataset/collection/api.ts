import { ParentIdSchema } from '../../../../common/parentFolder/type';
import { ObjectIdSchema } from '../../../../common/type/mongo';
import { OutLinkChatAuthSchema } from '../../../../support/permission/chat';
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
