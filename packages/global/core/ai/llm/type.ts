import type openai from 'openai';
import type { Stream } from 'openai/streaming';
import z from 'zod';

/* 通用类型 */
export const ChatCompletionContentPartTextSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
  key: z.string().optional()
});
// tool function
export const ChatCompletionMessageToolCallFunctionSchema = z.object({
  arguments: z.string().meta({ description: '工具参数' }),
  name: z.string().meta({ description: '工具名称' })
});

// Function call message
export const ChatCompletionMessageFunctionCallSchema =
  ChatCompletionMessageToolCallFunctionSchema.extend({
    id: z.string().optional().meta({ description: '工具调用 ID' }),
    toolName: z.string().optional().meta({ description: '工具名称' }),
    toolAvatar: z.string().optional().meta({ description: '工具头像' })
  });
export type ChatCompletionMessageFunctionCall = z.infer<
  typeof ChatCompletionMessageFunctionCallSchema
>;

/**
 * System message: 对齐 openai SDK 的 ChatCompletionSystemMessageParam
 * content 仅允许字符串或纯文本 part 数组
 */
export const ChatCompletionSystemMessageParamSchema = z.object({
  role: z.literal('system'),
  content: z.union([z.string(), z.array(ChatCompletionContentPartTextSchema)]),
  name: z.string().optional()
});
export type ChatCompletionSystemMessageParam = z.infer<
  typeof ChatCompletionSystemMessageParamSchema
>;

/* ---------- User Input message:  ChatCompletionContentPart schemas ----------
 * openai SDK 不导出 runtime zod schema，这里手写对齐 SDK 的联合类型，
 * 并加上 FastGPT 的扩展字段：所有分支可选 `key`，以及自定义 `file_url` 分支。
 * 外部再扩展新分支：
 *   z.discriminatedUnion('type', [
 *     ...ChatCompletionContentPartSchema.options,
 *     MyCustomPartSchema
 *   ])
 */
export const ChatCompletionContentPartImageSchema = z.object({
  type: z.literal('image_url'),
  image_url: z.object({
    url: z.string(),
    detail: z.enum(['auto', 'low', 'high']).optional()
  }),
  key: z.string().optional()
});
export const ChatCompletionContentPartInputAudioSchema = z.object({
  type: z.literal('input_audio'),
  input_audio: z.object({
    data: z.string(),
    format: z.enum(['wav', 'mp3'])
  }),
  key: z.string().optional()
});
// SDK 的 `file` 分支（base64 / file_id 输入）
export const ChatCompletionContentPartFileSchema = z.object({
  type: z.literal('file'),
  file: z.object({
    file_data: z.string().optional(),
    file_id: z.string().optional(),
    filename: z.string().optional()
  }),
  key: z.string().optional()
});
// FastGPT 自定义扩展：外链文件
export const ChatCompletionContentPartFileTypeSchema = z.object({
  type: z.literal('file_url'),
  name: z.string(),
  url: z.string(),
  key: z.string().optional()
});
export const ChatCompletionContentPartSchema = z.discriminatedUnion('type', [
  ChatCompletionContentPartTextSchema,
  ChatCompletionContentPartImageSchema,
  ChatCompletionContentPartInputAudioSchema,
  ChatCompletionContentPartFileSchema,
  ChatCompletionContentPartFileTypeSchema
]);
export type ChatCompletionContentPart = z.infer<typeof ChatCompletionContentPartSchema>;
export type ChatCompletionContentPartText = z.infer<typeof ChatCompletionContentPartTextSchema>;

export const ChatCompletionUserMessageParamSchema = z.object({
  role: z.literal('user'),
  content: z.union([z.string(), z.array(ChatCompletionContentPartSchema)]),
  name: z.string().optional()
});
export type ChatCompletionUserMessageParam = z.infer<typeof ChatCompletionUserMessageParamSchema>;

/* ========= User end ===== */

/**
 * Tool message: 对齐 openai SDK 的 ChatCompletionToolMessageParam，新增可选 `name`
 * SDK content 仅允许纯文本 part
 */
export const ChatCompletionToolMessageParamSchema = z.object({
  role: z.literal('tool'),
  content: z.union([z.string(), z.array(ChatCompletionContentPartTextSchema)]),
  tool_call_id: z.string(),
  name: z.string().optional()
});
export type ChatCompletionToolMessageParam = z.infer<typeof ChatCompletionToolMessageParamSchema>;

/**
 * Function message: 对齐 openai SDK 的 ChatCompletionFunctionMessageParam
 * SDK 已标记 deprecated，保留用于旧接口兼容
 */
export const ChatCompletionFunctionMessageParamSchema = z.object({
  role: z.literal('function'),
  content: z.string().nullable(),
  name: z.string()
});
export type ChatCompletionFunctionMessageParam = z.infer<
  typeof ChatCompletionFunctionMessageParamSchema
>;

/**
 * Assistant message: 对齐 openai SDK 的 ChatCompletionAssistantMessageParam
 * - content: 文本或 text/refusal part 数组，可空
 * - tool_calls / function_call（已废弃）/ audio / refusal 全部可选
 * - 新增 FastGPT 扩展 `interactive` 字段
 */
// SDK 的 refusal content part（仅出现在 assistant 消息里）
export const ChatCompletionContentPartRefusalSchema = z.object({
  type: z.literal('refusal'),
  refusal: z.string()
});
export type ChatCompletionContentPartRefusal = z.infer<
  typeof ChatCompletionContentPartRefusalSchema
>;
// SDK 的 ChatCompletionMessageToolCall（目前 type 只有 'function' 一种）
export const ChatCompletionMessageToolCallSchema = z.object({
  id: z.string(),
  type: z.literal('function'),
  function: ChatCompletionMessageToolCallFunctionSchema
});
export type ChatCompletionMessageToolCall = z.infer<typeof ChatCompletionMessageToolCallSchema>;

export const ChatCompletionAssistantMessageParamSchema = z.object({
  role: z.literal('assistant'),
  content: z
    .union([
      z.string(),
      z.array(
        z.discriminatedUnion('type', [
          ChatCompletionContentPartTextSchema,
          ChatCompletionContentPartRefusalSchema
        ])
      )
    ])
    .nullish()
    .meta({
      description: 'Assistant message content',
      example: 'Hello, how are you?'
    }),
  tool_calls: z.array(ChatCompletionMessageToolCallSchema).optional().meta({
    description: '工具调用'
  }),
  // FastGPT 自定义扩展。为避免与 workflow/interactive 形成循环依赖，此处用 z.any() 占位，
  // 真实类型见 packages/global/core/workflow/template/system/interactive/type.ts:WorkflowInteractiveResponseType
  interactive: z.any().optional().meta({
    description: '交互式响应（FastGPT 自定义扩展）'
  }),
  // 下面的几个，目前系统没用到
  audio: z.object({ id: z.string() }).nullish(),
  function_call: ChatCompletionMessageToolCallFunctionSchema.nullish().meta({
    description: '函数调用',
    deprecated: true
  }),
  name: z.string().optional(),
  refusal: z.string().nullish()
});
export type ChatCompletionAssistantMessageParam = z.infer<
  typeof ChatCompletionAssistantMessageParamSchema
>;

/* =====Assistant end ===== */

/**
 * Developer message: 对齐 openai SDK 的 ChatCompletionDeveloperMessageParam
 * o1+ 模型用 developer 消息代替 system
 */
export const ChatCompletionDeveloperMessageParamSchema = z.object({
  role: z.literal('developer'),
  content: z.union([z.string(), z.array(ChatCompletionContentPartTextSchema)]),
  name: z.string().optional()
});
export type ChatCompletionDeveloperMessageParam = z.infer<
  typeof ChatCompletionDeveloperMessageParamSchema
>;

/**
 * ChatCompletionMessageParam: 6 个 role 的 discriminated union
 * 每个分支附加 FastGPT 全局扩展字段：reasoning_content / dataId / hideInUI
 */
const messageParamExtraFields = {
  reasoning_content: z.string().optional(),
  dataId: z.string().optional(),
  hideInUI: z.boolean().optional()
};
export const ChatCompletionMessageParamSchema = z.discriminatedUnion('role', [
  ChatCompletionSystemMessageParamSchema.extend(messageParamExtraFields),
  ChatCompletionDeveloperMessageParamSchema.extend(messageParamExtraFields),
  ChatCompletionUserMessageParamSchema.extend(messageParamExtraFields),
  ChatCompletionAssistantMessageParamSchema.extend(messageParamExtraFields),
  ChatCompletionToolMessageParamSchema.extend(messageParamExtraFields),
  ChatCompletionFunctionMessageParamSchema.extend(messageParamExtraFields)
]);
export type ChatCompletionMessageParam = z.infer<typeof ChatCompletionMessageParamSchema>;

/* ========= Message end ===== */

/* ===== 一些自定义扩展类型 ===== */
// Stream response
export type StreamResponseType = Stream<
  openai.Chat.Completions.ChatCompletionChunk & { error?: any }
>;
export type UnStreamResponseType = openai.Chat.Completions.ChatCompletion & {
  error?: any;
};

export const CompletionFinishReasonSchema = z
  .union([
    z.enum(['error', 'close', 'stop', 'length', 'tool_calls', 'content_filter', 'function_call']),
    z.literal(null),
    z.undefined()
  ])
  .meta({ description: '模型完成原因' });
export type CompletionFinishReason = z.infer<typeof CompletionFinishReasonSchema>;

// export type { Stream };
export * from 'openai';
export * from 'openai/resources';

// openai v6 把 ChatCompletionTool 拆成 function | custom 联合，FastGPT 内部仅产/消费 function
import type {
  ChatCompletionFunctionTool,
  ChatCompletionReasoningEffort
} from 'openai/resources/chat/completions';
export type ChatCompletionTool = ChatCompletionFunctionTool;
export type ReasoningEffort = ChatCompletionReasoningEffort;

export type PromptTemplateItem = {
  title: string;
  desc: string;
  value: Record<string, string>;
};
