import z from 'zod';
import { optionalNullToUndefined } from '../../common/zod';
import { OpenObjectOpenApiMeta } from '../../common/zod/openapi';
import {
  ChatCompletionMessageParamSchema,
  ChatCompletionMessageToolCallSchema,
  CompletionFinishReasonSchema
} from '../../core/ai/llm/type';
import { ChatFileTypeEnum } from '../../core/chat/constants';

/* ============================================================================
 * API: 获取反向调用用户信息
 * Route: POST /api/invoke/userInfo
 * Method: POST
 * Description: 通过 invoke token 获取当前运行上下文的用户信息
 * Tags: ['通用-反向调用', '插件']
 * ============================================================================ */
export const InvokeUserInfoResponseSchema = z.object({
  username: z.string().meta({ description: '账号', example: 'user@example.com' }),
  contact: z.string().nullish().meta({ description: '联系方式', example: '13800138000' }),
  memberName: z.string().nullish().meta({ description: '成员名称', example: 'FastGPT 用户' }),
  orgs: z.array(
    z.object({
      pathId: z.string().meta({ description: '组织路径 ID', example: 'root/team-a' }),
      name: z.string().meta({ description: '组织名称', example: '研发团队' })
    })
  ),
  groups: z.array(
    z.object({ name: z.string().meta({ description: '群组名称', example: '开发者' }) })
  )
});

export type InvokeUserInfoResponseType = z.infer<typeof InvokeUserInfoResponseSchema>;

/* ============================================================================
 * API: 获取反向调用企微企业访问凭证
 * Route: POST /api/invoke/wecom/corpToken
 * Method: POST
 * Description: 通过 invoke token 获取当前运行团队的企微企业短期访问凭证
 * Tags: ['Plugin', 'Invoke', 'Wecom', 'Read']
 * ============================================================================ */
/** @deprecated 仅供当前 Pro 子模块过渡使用；该接口没有请求体。 */
export const InvokeWecomCorpTokenBodySchema = z.object({});
/** @deprecated 仅供当前 Pro 子模块过渡使用；该接口没有查询参数。 */
export const InvokeWecomCorpTokenQuerySchema = z.object({});

export const InvokeWecomCorpTokenResponseSchema = z.object({
  accessToken: z.string().describe('企微企业访问凭证'),
  expiresIn: z.number().describe('凭证有效期，单位秒')
});

/** @deprecated 仅供当前 Pro 子模块过渡使用。 */
export type InvokeWecomCorpTokenBodyType = z.infer<typeof InvokeWecomCorpTokenBodySchema>;
/** @deprecated 仅供当前 Pro 子模块过渡使用。 */
export type InvokeWecomCorpTokenQueryType = z.infer<typeof InvokeWecomCorpTokenQuerySchema>;
export type InvokeWecomCorpTokenResponseType = z.infer<typeof InvokeWecomCorpTokenResponseSchema>;

/* ============================================================================
 * API: 反向调用文件上传
 * Route: POST /api/invoke/fileUpload
 * Method: POST
 * Description: 通过 invoke token 上传 multipart/form-data 文件到当前对话文件目录
 * Tags: ['通用-反向调用', '插件']
 * ============================================================================ */
export const InvokeFileUploadBodySchema = z.object({
  fileName: z.string().min(1).optional().meta({
    description: '自定义文件名；不传时使用上传文件的原始名称',
    example: 'result.txt'
  })
});

export const InvokeFileUploadFormSchema = InvokeFileUploadBodySchema.extend({
  file: z.string().meta({
    format: 'binary',
    description: '待上传的文件（二进制）'
  })
});

export const InvokeAuthorizationHeaderSchema = z.object({
  authorization: z.string().meta({
    description: '反向调用凭证，格式为 Bearer <invokeToken>',
    example: 'Bearer invoke-token'
  })
});

export const InvokeFileUploadResponseSchema = z.object({
  url: z.string().meta({
    description: '上传后的文件访问 URL',
    example: 'https://fastgpt.example.com/api/system/file/d/alias-abc'
  }),
  key: z.string().meta({
    description: '上传后的私有 S3 对象 key。用于对话持久化后移除临时 TTL 或返回标准文件对象。',
    example: 'chat/app/68ad85a7463006c963799a05/user-1/chat-1/result.txt'
  }),
  filename: z.string().meta({
    description: '文件名',
    example: 'result.txt'
  }),
  contentType: z.string().optional().meta({
    description: '文件 MIME 类型',
    example: 'text/plain'
  }),
  type: z.enum(ChatFileTypeEnum).meta({
    description: '聊天文件类型',
    example: ChatFileTypeEnum.document
  })
});

export type InvokeFileUploadBodyType = z.infer<typeof InvokeFileUploadBodySchema>;
export type InvokeFileUploadResponseType = z.infer<typeof InvokeFileUploadResponseSchema>;

/* ============================================================================
 * API: 反向调用大语言模型 Chat Completions
 * Route: POST /api/invoke/llm/chat/completions
 * Method: POST
 * Description: 插件通过 invoke token（需具备 model:invoke 权限）调用平台已授权的 LLM/VLM 模型，100% 兼容 OpenAI Chat Completions 契约
 * Tags: ['通用-反向调用', '插件']
 * ============================================================================ */
export const InvokeChatCompletionToolSchema = z.object({
  type: z.literal('function').meta({
    description: '工具类型，固定为 function',
    example: 'function'
  }),
  function: z.object({
    name: z.string().min(1).meta({
      description: '工具函数名称',
      example: 'search_docs'
    }),
    description: z.string().optional().meta({
      description: '工具函数用途说明',
      example: '检索相关技术文档'
    }),
    parameters: z
      .record(z.string(), z.any())
      .optional()
      .meta({
        ...OpenObjectOpenApiMeta,
        description: '工具函数入参 JSON Schema'
      }),
    strict: z.boolean().nullish().meta({
      description: '是否启用严格 Schema 校验'
    })
  })
});

export const InvokeChatCompletionToolChoiceSchema = z.union([
  z.enum(['none', 'auto', 'required']),
  z.object({
    type: z.literal('function'),
    function: z.object({
      name: z.string().min(1).meta({
        description: '指定强制调用的工具函数名称',
        example: 'search_docs'
      })
    })
  })
]);

export const InvokeChatCompletionResponseFormatSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('text').meta({
      description: '普通文本输出格式'
    })
  }),
  z.object({
    type: z.literal('json_object').meta({
      description: 'JSON 对象输出格式'
    })
  }),
  z.object({
    type: z.literal('json_schema').meta({
      description: '结构化 JSON Schema 输出格式'
    }),
    json_schema: z
      .union([
        z
          .object({
            name: z.string().min(1).meta({
              description: 'JSON Schema 名称',
              example: 'structured_answer'
            }),
            description: z.string().optional().meta({
              description: 'JSON Schema 说明'
            }),
            schema: z
              .record(z.string(), z.any())
              .optional()
              .meta({
                ...OpenObjectOpenApiMeta,
                description: 'JSON Schema 定义对象'
              }),
            strict: z.boolean().nullish().meta({
              description: '是否开启严格 Schema 约束'
            })
          })
          .passthrough(),
        z.string().min(1)
      ])
      .meta({
        description: 'JSON Schema 配置对象或序列化字符串'
      })
  })
]);

export const InvokeChatCompletionStreamOptionsSchema = z
  .object({
    include_usage: z.boolean().optional().meta({
      description: '流式响应结束前是否在末尾 chunk 中包含 token usage 统计',
      example: true
    })
  })
  .passthrough();

export const InvokeChatCompletionsBodySchema = z
  .object({
    model: z.string().trim().min(1).meta({
      description: 'FastGPT 平台的模型唯一标识 modelId（ai_models._id），禁止直接传上游模型名',
      example: '68ad85a7463006c963799a05'
    }),
    messages: z
      .array(ChatCompletionMessageParamSchema)
      .min(1)
      .meta({
        description: 'OpenAI 标准对话消息列表（至少包含一条消息）',
        example: [{ role: 'user', content: '请总结这段文本的核心要点' }]
      }),
    stream: optionalNullToUndefined(z.boolean()).meta({
      description: '是否以 text/event-stream SSE 流式返回结果；默认 false',
      example: false
    }),
    stream_options: optionalNullToUndefined(InvokeChatCompletionStreamOptionsSchema).meta({
      description: '流式输出附加配置'
    }),
    temperature: optionalNullToUndefined(z.number()).meta({
      description: '采样温度（OpenAI 标准范围，如 0~2）',
      example: 0.7
    }),
    top_p: optionalNullToUndefined(z.number()).meta({
      description: '核采样概率阈值（0~1）',
      example: 1
    }),
    max_tokens: optionalNullToUndefined(z.number().int().positive()).meta({
      description: '单次回复最大生成 Token 数',
      example: 1024
    }),
    max_completion_tokens: optionalNullToUndefined(z.number().int().positive()).meta({
      description: '单次回复最大补全 Token 数（含推理 Token）',
      example: 1024
    }),
    tools: optionalNullToUndefined(z.array(InvokeChatCompletionToolSchema)).meta({
      description: '可供模型调用的 Function Tool 列表'
    }),
    tool_choice: optionalNullToUndefined(InvokeChatCompletionToolChoiceSchema).meta({
      description: '工具调用选择策略'
    }),
    parallel_tool_calls: optionalNullToUndefined(z.boolean()).meta({
      description: '是否允许模型单轮并行发起多个工具调用'
    }),
    response_format: optionalNullToUndefined(InvokeChatCompletionResponseFormatSchema).meta({
      description: '输出格式约束（text / json_object / json_schema）'
    }),
    stop: optionalNullToUndefined(z.union([z.string(), z.array(z.string())])).meta({
      description: '停止序列（单个字符串或字符串数组）'
    }),
    seed: optionalNullToUndefined(z.number().int()).meta({
      description: '确定性采样随机种子'
    }),
    presence_penalty: optionalNullToUndefined(z.number()).meta({
      description: '存在惩罚系数（-2.0~2.0）'
    }),
    frequency_penalty: optionalNullToUndefined(z.number()).meta({
      description: '频率惩罚系数（-2.0~2.0）'
    }),
    logit_bias: optionalNullToUndefined(z.record(z.string(), z.number())).meta({
      description: '指定 Token 的采样偏置映射'
    }),
    logprobs: optionalNullToUndefined(z.boolean()).meta({
      description: '是否返回输出 Token 的对数概率'
    }),
    top_logprobs: optionalNullToUndefined(z.number().int().min(0).max(20)).meta({
      description: '每个输出位置返回的最可能 Token 数量（0~20）'
    }),
    n: optionalNullToUndefined(z.number().int().positive()).meta({
      description: '生成的候选回复数量',
      example: 1
    }),
    reasoning_effort: optionalNullToUndefined(
      z.enum(['none', 'minimal', 'low', 'medium', 'high', 'xhigh'])
    ).meta({
      description: '推理模型思考强度',
      example: 'medium'
    }),
    user: optionalNullToUndefined(z.string()).meta({
      description: '终端调用者标识'
    })
  })
  .passthrough();

export type InvokeChatCompletionsBodyType = z.infer<typeof InvokeChatCompletionsBodySchema>;

export const InvokeChatCompletionUsageSchema = z
  .object({
    prompt_tokens: z.number().meta({ description: '输入提示词 Token 数', example: 32 }),
    completion_tokens: z.number().meta({ description: '模型生成输出 Token 数', example: 64 }),
    total_tokens: z.number().meta({ description: '总消耗 Token 数', example: 96 })
  })
  .passthrough();

export const InvokeChatCompletionChoiceMessageSchema = z
  .object({
    role: z.literal('assistant').meta({ description: '助手角色标识', example: 'assistant' }),
    content: z.string().nullable().meta({
      description: '助手回复文本内容',
      example: '这是模型生成的结构化总结。'
    }),
    reasoning_content: z.string().nullish().meta({
      description: '推理模型返回的思考过程文本'
    }),
    refusal: z.string().nullish().meta({
      description: '模型安全拒绝说明'
    }),
    tool_calls: z.array(ChatCompletionMessageToolCallSchema).optional().meta({
      description: '模型触发的工具调用列表'
    })
  })
  .passthrough();

export const InvokeChatCompletionsResponseSchema = z
  .object({
    id: z.string().meta({ description: '补全响应 ID', example: 'chatcmpl-123' }),
    object: z.string().meta({ description: 'OpenAI 对象类型', example: 'chat.completion' }),
    created: z.number().meta({ description: '响应创建时间戳（秒）', example: 1700000000 }),
    model: z.string().meta({ description: '实际执行推理的上游模型名称', example: 'gpt-4o' }),
    choices: z
      .array(
        z
          .object({
            index: z.number().meta({ description: '候选回复索引', example: 0 }),
            message: InvokeChatCompletionChoiceMessageSchema,
            finish_reason: CompletionFinishReasonSchema
          })
          .passthrough()
      )
      .meta({ description: '候选补全结果列表' }),
    usage: InvokeChatCompletionUsageSchema.optional().meta({
      description: '本次调用的 Token 消耗统计'
    }),
    system_fingerprint: z.string().nullish().meta({
      description: '上游模型服务指纹'
    })
  })
  .passthrough();

export type InvokeChatCompletionsResponseType = z.infer<typeof InvokeChatCompletionsResponseSchema>;

const InvokeUpstreamUsageSchema = z
  .object({
    prompt_tokens: z.number().finite().nonnegative().optional(),
    completion_tokens: z.number().finite().nonnegative().optional(),
    total_tokens: z.number().finite().nonnegative().optional()
  })
  .passthrough()
  .refine(
    (usage) =>
      usage.prompt_tokens !== undefined ||
      usage.completion_tokens !== undefined ||
      usage.total_tokens !== undefined,
    { message: 'Upstream usage must contain token counts' }
  );

const InvokeUpstreamToolCallSchema = z
  .object({
    id: z.string().optional(),
    type: z.string().optional(),
    function: z
      .object({
        name: z.string(),
        arguments: z.string()
      })
      .passthrough()
      .optional()
  })
  .passthrough();

const InvokeUpstreamChoiceMessageSchema = z
  .object({
    role: z.string().min(1).optional(),
    content: z.string().nullish(),
    reasoning_content: z.string().nullish(),
    refusal: z.string().nullish(),
    tool_calls: z.array(InvokeUpstreamToolCallSchema).optional(),
    function_call: z.unknown().optional()
  })
  .passthrough()
  .refine(
    (message) =>
      message.content !== undefined ||
      message.reasoning_content !== undefined ||
      message.refusal !== undefined ||
      message.tool_calls !== undefined ||
      message.function_call !== undefined,
    { message: 'Upstream choice message is missing completion content' }
  );

/**
 * 上游非流式补全响应运行时校验 Schema：
 * 兼容第三方 OpenAI 兼容端点的可选元字段，同时强制校验非空 choices 与 message 业务字段，
 * 避免非法 HTTP 200 载荷进入计费结算或原样透传给插件。
 */
export const InvokeUpstreamChatCompletionSchema = z
  .object({
    id: z.string().optional(),
    object: z.string().optional(),
    created: z.number().finite().optional(),
    model: z.string().optional(),
    system_fingerprint: z.string().nullish(),
    choices: z
      .array(
        z
          .object({
            index: z.number().int().nonnegative().optional(),
            message: InvokeUpstreamChoiceMessageSchema,
            finish_reason: z.string().nullish(),
            logprobs: z.unknown().optional()
          })
          .passthrough()
      )
      .min(1, 'Upstream completion response must contain at least one choice'),
    usage: InvokeUpstreamUsageSchema.nullish()
  })
  .passthrough();

const InvokeUpstreamDeltaToolCallSchema = z
  .object({
    index: z.number().int().nonnegative().optional(),
    id: z.string().optional(),
    type: z.string().optional(),
    function: z
      .object({
        name: z.string().optional(),
        arguments: z.string().optional()
      })
      .passthrough()
      .optional()
  })
  .passthrough();

const InvokeUpstreamStreamChoiceSchema = z
  .object({
    index: z.number().int().nonnegative().optional(),
    delta: z
      .object({
        role: z.string().optional(),
        content: z.string().nullish(),
        reasoning_content: z.string().nullish(),
        refusal: z.string().nullish(),
        tool_calls: z.array(InvokeUpstreamDeltaToolCallSchema).optional(),
        function_call: z.unknown().optional()
      })
      .passthrough(),
    finish_reason: z.string().nullish(),
    logprobs: z.unknown().optional()
  })
  .passthrough();

/**
 * 上游 SSE 流式分片运行时校验 Schema：
 * 要求分片至少携带合法的 choices[*].delta 或合法 usage，拒绝空壳或字段类型异常的帧。
 */
export const InvokeUpstreamChatCompletionChunkSchema = z
  .object({
    id: z.string().optional(),
    object: z.string().optional(),
    created: z.number().finite().optional(),
    model: z.string().optional(),
    system_fingerprint: z.string().nullish(),
    choices: z.array(InvokeUpstreamStreamChoiceSchema).optional(),
    usage: InvokeUpstreamUsageSchema.nullish()
  })
  .passthrough()
  .refine((chunk) => (chunk.choices && chunk.choices.length > 0) || Boolean(chunk.usage), {
    message: 'Upstream stream chunk must contain choices or usage'
  });

export const InvokeChatCompletionsSseResponseSchema = z.string().meta({
  description:
    '标准 OpenAI ChatCompletionChunk SSE 事件流，每帧为 data: <JSON> 并以 data: [DONE] 结束',
  example:
    'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1700000000,"model":"gpt-4o","choices":[{"index":0,"delta":{"role":"assistant","content":"你好"},"finish_reason":null}]}\n\ndata: [DONE]\n\n'
});

export type InvokeChatCompletionsSseResponseType = z.infer<
  typeof InvokeChatCompletionsSseResponseSchema
>;

export const InvokeOpenAIErrorResponseSchema = z.object({
  error: z.object({
    message: z.string().meta({
      description: '可读错误说明',
      example: 'Model not found or disabled'
    }),
    type: z.string().meta({
      description: 'OpenAI 兼容错误分类',
      example: 'invalid_request_error'
    }),
    code: z.string().nullable().optional().meta({
      description: '机器可读错误码',
      example: 'model_not_found'
    })
  })
});

export type InvokeOpenAIErrorResponseType = z.infer<typeof InvokeOpenAIErrorResponseSchema>;
