import { z } from 'zod';
import { ObjectIdSchema } from '../../../../common/type/mongo';
import { OutLinkChatAuthSchema } from '../../../../support/permission/chat';
import { DatasetCiteItemSchema } from '../../../../core/dataset/type';

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

export const GetQuoteResponseSchema = z.array(DatasetCiteItemSchema);
export type GetQuoteResponseType = z.infer<typeof GetQuoteResponseSchema>;

/* ============================================================================
 * API: 获取集合分页引用数据
 * Route: POST /api/core/chat/quote/getCollectionQuote
 * Method: POST
 * Description: 以链式分页方式获取指定集合的引用数据，支持前后翻页
 * Tags: ['Chat', 'Quote', 'Read']
 * ============================================================================ */

export const GetCollectionQuoteBodySchema = OutLinkChatAuthSchema.extend({
  appId: ObjectIdSchema.describe('应用 ID'),
  chatId: z.string().min(1).max(256).describe('对话 ID'),
  chatItemDataId: z.string().min(1).max(256).describe('对话消息 dataId'),
  collectionId: ObjectIdSchema.describe('集合 ID'),
  pageSize: z.number().int().min(1).max(30).default(15).describe('每页条数，范围 [1, 30]'),
  anchor: z.number().optional().describe('当前锚点 chunkIndex'),
  initialId: z.string().optional().describe('初始定位数据 ID'),
  nextId: z.string().optional().describe('向后翻页的游标 ID'),
  prevId: z.string().optional().describe('向前翻页的游标 ID')
});
export type GetCollectionQuoteBodyType = z.infer<typeof GetCollectionQuoteBodySchema>;

export const GetCollectionQuoteResSchema = z.object({
  list: z.array(
    DatasetCiteItemSchema.extend({
      id: z.string().describe('数据 ID（alias _id）'),
      anchor: z.number().optional().describe('chunk 序号（alias index）')
    })
  ),
  hasMorePrev: z.boolean().describe('是否还有更多前置数据'),
  hasMoreNext: z.boolean().describe('是否还有更多后置数据')
});
export type GetCollectionQuoteResType = z.infer<typeof GetCollectionQuoteResSchema>;
