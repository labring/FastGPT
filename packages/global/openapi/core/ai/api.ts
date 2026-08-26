import { ObjectIdSchema } from '../../../common/type/mongo';
import z from 'zod';
import {
  ChatGenerateStatusSchema,
  createOutLinkChatTargetInputSchema,
  transformChatAuthTargetInput
} from '../chat/api';
import { OutLinkChatAuthSchema } from '../../../support/permission/chat';

/* ============================================================================
 * API: 优化 Prompt
 * Route: POST /api/core/ai/optimizePrompt
 * Method: POST
 * Description: 根据用户的优化要求调用指定模型，以 SSE 流式返回优化后的 Prompt
 * Tags: ['AI 辅助生成', 'Write']
 * ============================================================================ */

export const OptimizePromptBodySchema = z.object({
  originalPrompt: z.string().default('').meta({
    example: '你是一个客服助手，请回答用户问题。',
    description: '需要优化的原始 Prompt；未传时按空字符串处理'
  }),
  optimizerInput: z.string().meta({
    example: '增强角色约束，并补充清晰的输出格式。',
    description: '用户对 Prompt 的优化要求'
  }),
  modelId: ObjectIdSchema.meta({
    description: '执行 Prompt 优化的模型 ID'
  })
});
export type OptimizePromptBody = z.infer<typeof OptimizePromptBodySchema>;

export const OptimizePromptResponseSchema = z.string().meta({
  example: 'event: answer\ndata: {"choices":[{"delta":{"content":"# Role"}}]}\n\n',
  description: 'SSE 事件流；answer 事件采用 OpenAI delta 格式，最后一个事件的数据为 [DONE]'
});
export type OptimizePromptResponse = z.infer<typeof OptimizePromptResponseSchema>;

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
  teamId: ObjectIdSchema.meta({
    example: '60f6b3b3b3b3b3b3b3b3b3b3',
    description: '所属团队 ID'
  }),
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
 * 断线续传：GET /api/core/chat/resume（与 v2/chat/completions 配套；支持站内和分享鉴权）
 * Tags: ['会话操作', 'Read']
 * ============================================================================ */

export const ResumeStreamParamsRawSchema = createOutLinkChatTargetInputSchema({
  outLinkAuthData: OutLinkChatAuthSchema.optional().meta({
    description: '外链鉴权数据。GET query 中需 JSON 序列化。'
  }),
  chatId: z.string().meta({ example: 'bEdzC6PNupZrr1RoVutMF2DL', description: '聊天 ID' })
});
export const ResumeStreamParamsSchema = ResumeStreamParamsRawSchema.transform(
  transformChatAuthTargetInput
);

export type ResumeStreamParams = z.infer<typeof ResumeStreamParamsRawSchema>;
export type ResumeStreamRuntimeParams = z.infer<typeof ResumeStreamParamsSchema>;

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
  chatGenerateStatus: ChatGenerateStatusSchema.meta({
    example: 1
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
