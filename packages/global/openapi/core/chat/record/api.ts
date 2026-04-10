import z from 'zod';
import { OutLinkChatAuthSchema } from '../../../../support/permission/chat';
import { ObjectIdSchema } from '../../../../common/type/mongo';
import { DatasetCiteItemSchema } from '../../../../core/dataset/type';
import { LinkedListResponseSchema, LinkedPaginationSchema, PaginationSchema } from '../../../api';
import { ChatItemMiniSchema } from '../../../../core/chat/type';
import { AppTTSConfigTypeSchema } from '../../../../core/app/type';
import { GetChatTypeEnum } from '../../../../core/chat/constants';

/* ============================================================================
 * API: 获取对话响应详细数据
 * Route: GET /api/core/chat/record/getResData
 * Method: GET
 * Description: 根据 dataId 获取对话中某条 AI 回复的详细响应数据
 * ============================================================================ */

export const GetResDataQuerySchema = OutLinkChatAuthSchema.extend({
  appId: z.string().describe('应用ID'),
  chatId: z.string().optional().describe('会话ID'),
  dataId: z.string().describe('对话数据ID')
});
export type GetResDataQueryType = z.infer<typeof GetResDataQuerySchema>;

/* ============================================================================
 * API: 删除对话记录
 * Route: DELETE /api/core/chat/record/delete
 * Method: DELETE
 * Description: 软删除指定的对话消息记录（设置 deleteTime）
 * ============================================================================ */

export const DeleteChatRecordBodySchema = OutLinkChatAuthSchema.extend({
  appId: ObjectIdSchema.meta({ example: '68ad85a7463006c963799a05', description: '应用 ID' }),
  chatId: z.string().meta({ example: 'chat123', description: '会话 ID' }),
  contentId: z.string().optional().meta({
    example: 'content123',
    description: '要删除的消息 ID'
  }),
  delFile: z.coerce.boolean().optional().meta({
    example: false,
    description: '是否同时删除关联文件'
  })
});
export type DeleteChatRecordBodyType = z.infer<typeof DeleteChatRecordBodySchema>;

export const DeleteChatRecordResponseSchema = z.object({});
export type DeleteChatRecordResponseType = z.infer<typeof DeleteChatRecordResponseSchema>;

/* ============================================================================
 * API: 获取对话引用数据
 * Route: POST /api/core/chat/quote/getQuote
 * Method: POST
 * Description: 获取指定对话消息的数据集引用列表
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

/* ============================================================================
 * API: 分页获取对话记录
 * Route: POST /api/core/chat/record/getPaginationRecords
 * Method: POST
 * Description: 分页获取指定应用和会话的对话记录，支持多种鉴权模式
 * ============================================================================ */

const GetRecordPropsSchema = z.object({
  appId: ObjectIdSchema.meta({ example: '68ad85a7463006c963799a05', description: '应用 ID' }),
  chatId: z.string().optional().meta({ example: 'chat123', description: '会话 ID' }),
  loadCustomFeedbacks: z.boolean().optional().meta({
    example: false,
    description: '是否加载自定义反馈'
  }),
  type: z
    .enum(GetChatTypeEnum)
    .optional()
    .meta({ example: 'normal', description: '获取类型，影响数据过滤规则' }),
  includeDeleted: z.boolean().optional().meta({
    example: false,
    description: '是否包含已删除的记录'
  })
});
export const GetPaginationRecordsBodySchema = PaginationSchema.extend(
  OutLinkChatAuthSchema.shape
).extend(GetRecordPropsSchema.shape);
export type GetPaginationRecordsBodyType = z.infer<typeof GetPaginationRecordsBodySchema>;

export const GetPaginationRecordsResponseSchema = z.object({
  list: z.array(z.any()).meta({ description: '对话记录列表' }),
  total: z.number().int().nonnegative().meta({ example: 10, description: '总数' })
});
export type GetPaginationRecordsResponseType = z.infer<typeof GetPaginationRecordsResponseSchema>;

/* ============================================================================
 * API: 获取对话记录（v2）
 * Route: POST /api/core/chat/record/getRecordsV2
 * Method: POST
 * Description: 获取对话记录（v2）
 * ============================================================================ */
export const GetRecordsV2BodySchema = LinkedPaginationSchema(GetRecordPropsSchema.shape);
export type GetRecordsV2BodyType = z.infer<typeof GetRecordsV2BodySchema>;
export const GetRecordsV2ResponseSchema = LinkedListResponseSchema(ChatItemMiniSchema).extend({
  total: z.int()
});
export type GetRecordsV2ResponseType = z.infer<typeof GetRecordsV2ResponseSchema>;

/* ============================================================================
 * API: 获取语音合成
 * Route: POST /api/core/chat/record/getSpeech
 * Method: POST
 * Description: 将文本转换为语音，返回二进制音频数据流
 * ============================================================================ */

export const GetChatSpeechBodySchema = OutLinkChatAuthSchema.extend({
  appId: z.string().meta({ example: '68ad85a7463006c963799a05', description: '应用 ID' }),
  ttsConfig: AppTTSConfigTypeSchema.meta({ description: 'TTS 配置' }),
  input: z.string().meta({ example: '你好，世界', description: '要转换的文本内容' })
});
export type GetChatSpeechBodyType = z.infer<typeof GetChatSpeechBodySchema>;
