import { ObjectIdSchema } from '../../../common/type/mongo';
import z from 'zod';
import { ChatGenerateStatusEnum } from '../../../core/chat/constants';

// Query Params
export const GetLLMRequestRecordParamsSchema = z.object({
  requestId: z.string().meta({
    example: 'V1StGXR8_Z5jdHi6B-myT',
    description: 'LLM 请求追踪 ID'
  })
});

export type GetLLMRequestRecordParamsType = z.infer<typeof GetLLMRequestRecordParamsSchema>;

// Response
export const LLMRequestRecordSchema = z.object({
  _id: ObjectIdSchema,
  requestId: z.string().meta({
    example: 'V1StGXR8_Z5jdHi6B-myT',
    description: '请求追踪 ID'
  }),
  body: z.record(z.string(), z.any()).meta({
    description: 'LLM 请求体'
  }),
  response: z.record(z.string(), z.any()).meta({
    description: 'LLM 响应内容'
  }),
  createdAt: z.coerce.date().meta({
    example: '2024-01-01T00:00:00.000Z',
    description: '创建时间'
  })
});

export type LLMRequestRecordSchemaType = z.infer<typeof LLMRequestRecordSchema>;

/* ============================================================================
 * 共享：OpenAI 风格 ChatMessage（与其它 LLM 接口复用）
 * ============================================================================ */

export const ChatMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system', 'tool', 'function']).meta({
    example: 'user',
    description: '消息角色'
  }),
  content: z
    .union([z.string(), z.array(z.object())])
    .optional()
    .meta({
      example: '你好',
      description: '消息内容'
    }),
  name: z.string().optional().meta({ description: '发送者名称' }),
  tool_calls: z.array(z.object()).optional().meta({ description: '工具调用' }),
  tool_call_id: z.string().optional().meta({ description: '工具调用 ID' })
});

/* ============================================================================
 * 断线续传：GET /api/v2/chat/resume（与 v2/chat/completions 同前缀；query 仅 appId / chatId / teamId）
 * ============================================================================ */

export const ResumeStreamParamsSchema = z.object({
  appId: ObjectIdSchema,
  teamId: ObjectIdSchema.optional(),
  chatId: z.string().meta({ example: 'bEdzC6PNupZrr1RoVutMF2DL', description: '聊天 ID' })
});

export type ResumeStreamParams = z.infer<typeof ResumeStreamParamsSchema>;

export const StreamResumeCompletedRecordsSchema = z.object({
  list: z.array(z.any()).meta({
    description: '最新已落库的聊天记录'
  }),
  total: z.number().int().nonnegative().meta({
    example: 2,
    description: '聊天记录总数'
  }),
  hasMorePrev: z.boolean().meta({
    example: false,
    description: '是否还有更早的记录'
  }),
  hasMoreNext: z.boolean().meta({
    example: false,
    description: '是否还有更新的记录'
  })
});

export const StreamNoNeedToBeResumeSchema = z.object({
  chatGenerateStatus: z.enum(ChatGenerateStatusEnum).meta({
    example: ChatGenerateStatusEnum.done,
    description: '聊天生成状态'
  }),
  hasBeenRead: z.boolean().meta({
    example: true,
    description: '是否已读'
  }),
  records: StreamResumeCompletedRecordsSchema.meta({
    description: '当恢复请求到达时，对话已结束并已落库的最新聊天记录'
  })
});

export type StreamNoNeedToBeResumeType = z.infer<typeof StreamNoNeedToBeResumeSchema>;
