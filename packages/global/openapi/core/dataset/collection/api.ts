import { ObjectIdSchema } from '../../../../common/type/mongo';
import { OutLinkChatAuthSchema } from '../../../../support/permission/chat';
import z from 'zod';

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
