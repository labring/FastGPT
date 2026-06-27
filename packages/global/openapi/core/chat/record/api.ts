import z from 'zod';
import { OutLinkChatAuthSchema } from '../../../../support/permission/chat';
import { ObjectIdSchema } from '../../../../common/type/mongo';
import { DatasetCiteItemSchema } from '../../../../core/dataset/type';
import { LinkedListResponseSchema, LinkedPaginationSchema, PaginationSchema } from '../../../api';
import { ChatItemMiniSchema } from '../../../../core/chat/type';
import { AppTTSConfigTypeSchema } from '../../../../core/app/type';
import { ChatSourceTypeEnum, GetChatTypeEnum } from '../../../../core/chat/constants';
import {
  createOutLinkChatTargetInputSchema,
  refineRequiredChatTargetInput,
  transformChatAuthTargetInput
} from '../api';

const GetRecordTypeSchema = z.enum([
  GetChatTypeEnum.normal,
  GetChatTypeEnum.outLink,
  GetChatTypeEnum.home
]);

const QueryStringArraySchema = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((val) => {
    if (!val) return undefined;
    const values = Array.isArray(val) ? val : val.split(',');

    return values.map((item) => item.trim()).filter(Boolean);
  });

/* ============================================================================
 * API: 获取对话响应详细数据
 * Route: GET /api/core/chat/record/getResData
 * Method: GET
 * Description: 根据 dataId 获取对话中某条 AI 回复的详细响应数据
 * ============================================================================ */

export const GetResDataQueryRawSchema = createOutLinkChatTargetInputSchema({
  chatId: z.string().optional().describe('会话ID'),
  dataId: z.string().describe('对话数据ID')
});
export const GetResDataQuerySchema = GetResDataQueryRawSchema.transform(
  transformChatAuthTargetInput
);
export type GetResDataQueryType = z.infer<typeof GetResDataQueryRawSchema>;
export type GetResDataQueryRuntimeType = z.infer<typeof GetResDataQuerySchema>;

const DeleteChatRecordPropsSchema = {
  chatId: z.string().meta({ example: 'chat123', description: '会话 ID' }),
  contentId: z.string().optional().meta({
    example: 'content123',
    description: '要删除的消息 ID'
  }),
  contentIds: QueryStringArraySchema.meta({
    example: ['content123', 'content456'],
    description: '要删除的消息 ID 列表'
  })
};
export const DeleteChatRecordBodyRawSchema = createOutLinkChatTargetInputSchema(
  DeleteChatRecordPropsSchema
);
export const DeleteChatRecordBodySchema = DeleteChatRecordBodyRawSchema.transform(
  transformChatAuthTargetInput
);
export type DeleteChatRecordBodyType = z.infer<typeof DeleteChatRecordBodyRawSchema>;
export type DeleteChatRecordBodyRuntimeType = z.infer<typeof DeleteChatRecordBodySchema>;

const QuoteBodyPropsSchema = {
  chatId: z.string().min(1).max(256).describe('会话ID'),
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
};

export const GetQuoteBodyRawSchema = createOutLinkChatTargetInputSchema(QuoteBodyPropsSchema);
export const GetQuoteBodySchema = GetQuoteBodyRawSchema.transform(transformChatAuthTargetInput);
export type GetQuoteBodyType = z.infer<typeof GetQuoteBodyRawSchema>;
export type GetQuoteBodyRuntimeType = z.infer<typeof GetQuoteBodySchema>;

export const DeleteChatRecordResponseSchema = z.undefined().meta({ description: '删除成功' });
export type DeleteChatRecordResponseType = z.infer<typeof DeleteChatRecordResponseSchema>;

/* ============================================================================
 * API: 获取对话引用数据
 * Route: POST /api/core/chat/quote/getQuote
 * Method: POST
 * Description: 获取指定对话消息的数据集引用列表
 * ============================================================================ */

const CollectionQuoteBodyPropsSchema = {
  chatId: z.string().min(1).max(256).describe('会话 ID'),
  chatItemDataId: z.string().min(1).max(256).meta({
    example: 'item_abc123',
    description: '对话消息 dataId'
  }),
  collectionId: ObjectIdSchema.describe('集合 ID'),
  pageSize: z.number().int().min(1).max(30).default(15).describe('每页条数，范围 [1, 30]'),
  anchor: z.number().optional().describe('当前锚点 chunkIndex'),
  initialId: z.string().optional().describe('初始定位数据 ID'),
  nextId: z.string().optional().describe('向后翻页的游标 ID'),
  prevId: z.string().optional().describe('向前翻页的游标 ID')
};

export const GetQuoteResponseSchema = z.array(DatasetCiteItemSchema);
export type GetQuoteResponseType = z.infer<typeof GetQuoteResponseSchema>;

/* ============================================================================
 * API: 获取集合分页引用数据
 * Route: POST /api/core/chat/quote/getCollectionQuote
 * Method: POST
 * Description: 以链式分页方式获取指定集合的引用数据，支持前后翻页
 * ============================================================================ */

export const GetCollectionQuoteBodyRawSchema = createOutLinkChatTargetInputSchema(
  CollectionQuoteBodyPropsSchema
);
export const GetCollectionQuoteBodySchema = GetCollectionQuoteBodyRawSchema.transform(
  transformChatAuthTargetInput
);
export type GetCollectionQuoteBodyType = z.infer<typeof GetCollectionQuoteBodyRawSchema>;
export type GetCollectionQuoteBodyRuntimeType = z.infer<typeof GetCollectionQuoteBodySchema>;

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
 * API: 分页获取对话
 * Route: POST /api/core/chat/record/getPaginationRecords
 * Method: POST
 * Description: 分页获取指定会话的对话，支持多种鉴权模式
 * ============================================================================ */

const GetRecordPropsSchema = {
  chatId: z.string().optional().meta({ example: 'chat123', description: '会话 ID' }),
  loadCustomFeedbacks: z.boolean().optional().meta({
    example: false,
    description: '是否加载自定义反馈'
  }),
  type: GetRecordTypeSchema.optional().meta({
    example: GetChatTypeEnum.normal,
    description: '获取类型，影响数据过滤规则'
  }),
  includeDeleted: z.boolean().optional().meta({
    example: false,
    description: '是否包含已删除的记录'
  })
};
export const GetPaginationRecordsBodyRawSchema = PaginationSchema.extend(
  createOutLinkChatTargetInputSchema(GetRecordPropsSchema).shape
).superRefine(refineRequiredChatTargetInput);
export const GetPaginationRecordsBodySchema = GetPaginationRecordsBodyRawSchema.transform(
  transformChatAuthTargetInput
);
export type GetPaginationRecordsBodyType = z.infer<typeof GetPaginationRecordsBodyRawSchema>;
export type GetPaginationRecordsBodyRuntimeType = z.infer<typeof GetPaginationRecordsBodySchema>;

export const GetPaginationRecordsResponseSchema = z.object({
  list: z.array(z.any()).meta({ description: '对话列表' }),
  total: z.number().int().nonnegative().meta({ example: 10, description: '总数' })
});
export type GetPaginationRecordsResponseType = z.infer<typeof GetPaginationRecordsResponseSchema>;

/* ============================================================================
 * API: 获取对话（v2）
 * Route: POST /api/core/chat/record/getRecordsV2
 * Method: POST
 * Description: 获取对话（v2）
 * ============================================================================ */
export const GetRecordsV2BodyRawSchema = LinkedPaginationSchema(
  createOutLinkChatTargetInputSchema(GetRecordPropsSchema).shape
).superRefine(refineRequiredChatTargetInput);
export const GetRecordsV2BodySchema = GetRecordsV2BodyRawSchema.transform(
  transformChatAuthTargetInput
);
export type GetRecordsV2BodyType = z.input<typeof GetRecordsV2BodyRawSchema>;
export type GetRecordsV2BodyRuntimeType = z.infer<typeof GetRecordsV2BodySchema>;
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

export const GetChatSpeechBodySchema = createOutLinkChatTargetInputSchema({
  ttsConfig: AppTTSConfigTypeSchema.meta({ description: 'TTS 配置' }),
  input: z.string().meta({ example: '你好，世界', description: '要转换的文本内容' })
}).transform(transformChatAuthTargetInput);
export type GetChatSpeechBodyType = z.infer<typeof GetChatSpeechBodySchema>;

/* ============================================================================
 * API: 语音转文字
 * Route: POST /api/v1/audio/transcriptions
 * Method: POST
 * Description: 将 multipart 表单里的音频转换为文本
 * ============================================================================ */

export const AudioTranscriptionsDataRawSchema = z.object({
  sourceType: z.enum(ChatSourceTypeEnum).describe('会话归属资源类型'),
  sourceId: ObjectIdSchema.describe('会话归属资源 ID'),
  chatId: z.string().min(1).max(256).describe('会话 ID'),
  outLinkAuthData: OutLinkChatAuthSchema.optional().describe('外链鉴权数据'),
  duration: z.coerce.number().optional().describe('录音时长，单位秒')
});
export const AudioTranscriptionsDataSchema = AudioTranscriptionsDataRawSchema;
export type AudioTranscriptionsDataType = z.infer<typeof AudioTranscriptionsDataRawSchema>;
export type AudioTranscriptionsDataRuntimeType = z.infer<typeof AudioTranscriptionsDataSchema>;

export const AudioTranscriptionsFormRawSchema = z.object({
  file: z.any().meta({ format: 'binary', description: '上传的音频文件（二进制）' }),
  data: AudioTranscriptionsDataRawSchema.meta({
    description: '语音识别参数（JSON 序列化后传入）'
  })
});
export type AudioTranscriptionsFormType = z.infer<typeof AudioTranscriptionsFormRawSchema>;
