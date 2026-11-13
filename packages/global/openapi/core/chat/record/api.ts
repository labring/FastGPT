import { ChatIdSchema } from '../../../../core/chat/schema';
import z from 'zod';
import { ObjectIdSchema } from '../../../../common/type/mongo';
import { OpenObjectOpenApiMeta } from '../../../../common/zod/openapi';
import { DatasetCiteItemSchema } from '../../../../core/dataset/type';
import {
  LinkedListResponseSchema,
  LinkedPaginationSchema,
  PaginationPageSizeSchema
} from '../../../api';
import { ChatItemMiniSchema } from '../../../../core/chat/type';
import { AppTTSConfigInputSchema } from '../../app/common/api';
import { GetChatTypeEnum } from '../../../../core/chat/constants';
import {
  createChatSourceInputSchema,
  transformChatSourceInput,
  createOutLinkChatTargetInputSchema,
  createOutLinkChatTargetQuerySchema,
  createPaginatedChatTargetInputSchema,
  transformChatAuthTargetInput
} from '../api';

const GetRecordTypeSchema = z.enum([
  GetChatTypeEnum.normal,
  GetChatTypeEnum.outLink,
  GetChatTypeEnum.home
]);

/* ============================================================================
 * API: 获取对话响应详细数据
 * Route: GET /api/core/chat/record/getResData
 * Method: GET
 * Description: 根据 dataId 获取对话中某条 AI 回复的详细响应数据
 * ============================================================================ */

export const GetResDataQueryRawSchema = createOutLinkChatTargetQuerySchema({
  chatId: ChatIdSchema.optional().describe('会话ID'),
  dataId: z.string().describe('对话数据ID')
});
export const GetResDataQuerySchema = GetResDataQueryRawSchema.transform(
  transformChatAuthTargetInput
);
export type GetResDataQueryType = z.infer<typeof GetResDataQueryRawSchema>;
export type GetResDataQueryRuntimeType = z.infer<typeof GetResDataQuerySchema>;

/* ============================================================================
 * API: 删除对话消息
 * Route: DELETE /api/core/chat/record/delete
 * Method: DELETE
 * Description: 软删除指定消息；Ask/Preview 的待回答状态由剩余消息推导
 * Tags: ['Chat', 'Delete']
 * ============================================================================ */

export const DeleteChatRecordBodyRawSchema = createOutLinkChatTargetInputSchema({
  chatId: ChatIdSchema.meta({ example: 'chat123', description: '会话 ID' }),
  contentId: z.string().optional().meta({
    example: 'content123',
    description: '要删除的消息 ID'
  }),
  contentIds: z
    .array(z.string().trim())
    .optional()
    .meta({
      example: ['content123', 'content456'],
      description: '要删除的消息 ID 列表'
    })
});
export const DeleteChatRecordBodySchema = DeleteChatRecordBodyRawSchema.transform(
  transformChatAuthTargetInput
);
export type DeleteChatRecordBodyType = z.infer<typeof DeleteChatRecordBodyRawSchema>;
export type DeleteChatRecordBodyRuntimeType = z.infer<typeof DeleteChatRecordBodySchema>;

const QuoteBodyPropsSchema = {
  chatId: ChatIdSchema.min(1).describe('会话ID'),
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

/* ============================================================================
 * API: 获取对话引用数据
 * Route: POST /api/core/chat/record/getQuote
 * Method: POST
 * Description: 获取指定对话消息的数据集引用列表
 * ============================================================================ */

const CollectionQuoteBodyPropsSchema = {
  chatId: ChatIdSchema.min(1).describe('会话 ID'),
  chatItemDataId: z.string().min(1).max(256).meta({
    example: 'item_abc123',
    description: '对话消息 dataId'
  }),
  collectionId: ObjectIdSchema.describe('集合 ID'),
  pageSize: z.number().int().min(1).max(30).default(20).describe('每页条数，默认 20，范围 [1, 30]'),
  anchor: z.number().optional().describe('当前锚点 chunkIndex'),
  initialId: z.string().optional().describe('初始定位数据 ID'),
  nextId: z.string().optional().describe('向后翻页的游标 ID'),
  prevId: z.string().optional().describe('向前翻页的游标 ID')
};

export const GetQuoteResponseSchema = z.array(DatasetCiteItemSchema);
export type GetQuoteResponseType = z.infer<typeof GetQuoteResponseSchema>;

/* ============================================================================
 * API: 获取集合分页引用数据
 * Route: POST /api/core/chat/record/getCollectionQuote
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
  chatId: ChatIdSchema.optional().meta({ example: 'chat123', description: '会话 ID' }),
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
export const GetPaginationRecordsBodyRawSchema =
  createPaginatedChatTargetInputSchema(GetRecordPropsSchema);
export const GetPaginationRecordsBodySchema = GetPaginationRecordsBodyRawSchema.transform(
  transformChatAuthTargetInput
);
export type GetPaginationRecordsBodyType = z.infer<typeof GetPaginationRecordsBodyRawSchema>;
export type GetPaginationRecordsBodyRuntimeType = z.infer<typeof GetPaginationRecordsBodySchema>;

export const GetPaginationRecordsResponseSchema = z.object({
  list: z.array(z.any()).meta({ items: OpenObjectOpenApiMeta, description: '对话列表' }),
  total: z.number().int().nonnegative().meta({ example: 10, description: '总数' })
});
export type GetPaginationRecordsResponseType = z.infer<typeof GetPaginationRecordsResponseSchema>;

/* ============================================================================
 * API: 获取对话（v2）
 * Route: POST /api/core/chat/record/getRecords_v2
 * Method: POST
 * Description: 获取对话（v2）
 * ============================================================================ */
const GetRecordsV2TargetBodySchema = createOutLinkChatTargetInputSchema({
  role: z.never().optional(),
  ...GetRecordPropsSchema
});

export const GetRecordsV2BodyRawSchema = GetRecordsV2TargetBodySchema.and(
  LinkedPaginationSchema({
    pageSize: PaginationPageSizeSchema.meta({
      description: '每页参考消息条数，默认 20，最多 500；为补齐轮次边界，实际返回条数可能略超'
    })
  })
).meta({
  // role 属于服务端推导字段，公开请求与 OpenAPI 都不允许客户端覆盖。
  not: { required: ['role'] }
});
export const GetRecordsV2BodySchema = GetRecordsV2BodyRawSchema.transform(
  transformChatAuthTargetInput
);
export type GetRecordsV2BodyType = z.input<typeof GetRecordsV2BodyRawSchema>;
export type GetRecordsV2BodyRuntimeType = z.infer<typeof GetRecordsV2BodySchema>;
const ChatRecordListItemSchema = ChatItemMiniSchema.and(
  // 历史接口还返回 time、_id 等消息展示字段，校验已知字段并保留现有元数据。
  z.looseObject({
    _id: ObjectIdSchema.optional(),
    dataId: z
      .string()
      .meta({ description: '聊天业务标识，用于消息详情、反馈及轮次关联，推荐使用此字段' }),
    id: z
      .string()
      .optional()
      .meta({ deprecated: true, description: '兼容旧客户端的 dataId 别名；已弃用，请使用 dataId' }),
    time: z.coerce.date().optional()
  })
);

export const GetRecordsV2ResponseSchema = LinkedListResponseSchema(ChatItemMiniSchema)
  .omit({ list: true })
  .extend({
    list: z
      .array(ChatRecordListItemSchema)
      .meta({ description: '聊天记录列表，业务标识使用 dataId' }),
    total: z.int(),
    prevCursor: z.string().nullable().meta({
      description:
        '向前翻页的 dataId，直接传入 prevId，服务端以 Human 定位轮次起点；无前页或当前列表为空时为 null'
    }),
    nextCursor: z.string().nullable().meta({
      description:
        '向后翻页的 dataId，直接传入 nextId，服务端以 AI 定位轮次终点；无后页或当前列表为空时为 null'
    })
  });
export type GetRecordsV2ResponseType = z.infer<typeof GetRecordsV2ResponseSchema>;

/* ============================================================================
 * API: 获取语音合成
 * Route: POST /api/core/chat/record/getSpeech
 * Method: POST
 * Description: 将文本转换为语音，返回二进制音频数据流
 * ============================================================================ */

export const GetChatSpeechBodySchema = createOutLinkChatTargetInputSchema({
  chatId: ChatIdSchema.min(1).optional().describe('已有会话 ID；传入时同时校验会话归属'),
  ttsConfig: AppTTSConfigInputSchema.meta({ description: 'TTS 配置' }),
  input: z.string().meta({ example: '你好，世界', description: '要转换的文本内容' })
}).transform(transformChatAuthTargetInput);
export type GetChatSpeechBodyType = z.infer<typeof GetChatSpeechBodySchema>;

/* ============================================================================
 * API: 语音转文字
 * Route: POST /api/v1/audio/transcriptions
 * Method: POST
 * Description: 将 multipart 表单里的音频转换为文本
 * ============================================================================ */

const AudioTranscriptionsProps = {
  chatId: ChatIdSchema.min(1).describe('会话 ID'),
  duration: z.coerce.number().optional().describe('录音时长，单位秒')
};
export const AudioTranscriptionsDataRawSchema =
  createChatSourceInputSchema(AudioTranscriptionsProps);
export const AudioTranscriptionsDataSchema =
  AudioTranscriptionsDataRawSchema.transform(transformChatSourceInput);

export type AudioTranscriptionsDataType = z.infer<typeof AudioTranscriptionsDataRawSchema>;
export type AudioTranscriptionsDataRuntimeType = z.infer<typeof AudioTranscriptionsDataSchema>;

export const AudioTranscriptionsFormRawSchema = z.object({
  file: z.string().meta({ format: 'binary', description: '上传的音频文件（二进制）' }),
  data: AudioTranscriptionsDataRawSchema.meta({
    description: '语音识别参数（JSON 序列化后传入）'
  })
});
export type AudioTranscriptionsFormType = z.infer<typeof AudioTranscriptionsFormRawSchema>;
