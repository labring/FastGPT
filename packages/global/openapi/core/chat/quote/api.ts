import { z } from 'zod';
import { ObjectIdSchema } from '../../../../common/type/mongo';
import { OutLinkChatAuthSchema } from '../../../../support/permission/chat';

/* ============================================================================
 * API: 获取对话引用数据
 * Route: POST /api/core/chat/quote/getQuote
 * Method: POST
 * Description: 获取指定对话消息的数据集引用列表
 * Tags: ['Chat', 'Quote', 'Read']
 * ============================================================================ */

export const GetQuoteBodySchema = OutLinkChatAuthSchema.extend({
  appId: ObjectIdSchema.describe('应用 ID'),
  chatId: z.string().min(1).max(256).meta({
    example: 'chat_abc123',
    description: '对话 ID'
  }),
  chatItemDataId: z.string().min(1).max(256).meta({
    example: 'item_abc123',
    description: '对话消息 dataId'
  }),
  datasetDataIdList: z
    .array(z.string().min(1).max(256))
    .max(200)
    .meta({
      example: ['68ad85a7463006c963799a05'],
      description: '数据集数据 ID 列表'
    }),
  collectionIdList: z
    .array(z.string().min(1).max(256))
    .max(200)
    .meta({
      example: ['68ad85a7463006c963799a06'],
      description: '集合 ID 列表'
    })
});
export type GetQuoteBodyType = z.infer<typeof GetQuoteBodySchema>;

export const DatasetCiteItemSchema = z.object({
  _id: z.string().meta({ description: '数据 ID' }),
  q: z.string().meta({ description: '问题/主文本' }),
  a: z.string().optional().meta({ description: '回答/补充文本' }),
  imagePreivewUrl: z.string().optional().meta({ description: '图片预览 URL' }),
  updateTime: z.any().meta({ description: '更新时间' }),
  index: z.number().optional().meta({ description: 'chunk 序号' }),
  updated: z.boolean().optional().meta({ description: '是否已更新' })
});

export const GetQuoteResponseSchema = z.array(DatasetCiteItemSchema).meta({
  description: '引用数据列表'
});
export type GetQuoteResponseType = z.infer<typeof GetQuoteResponseSchema>;
