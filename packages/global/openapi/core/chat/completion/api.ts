import z from 'zod';
import { ObjectIdSchema } from '../../../../common/type/mongo';
import { ChatCompletionMessageParamSchema } from '../../../../core/ai/llm/type';
import { getNanoid } from '../../../../common/string/tools';
import { AppChatConfigTypeSchema, AppSchemaTypeSchema } from '../../../../core/app/type';
import { AuthUserTypeEnum } from '../../../../support/permission/constant';
import { OutLinkChatAuthSchema } from '../../../../support/permission/chat';
import { StoreEdgeItemTypeSchema } from '../../../../core/workflow/type/edge';
import { OpenAPIStoreNodeItemTypeSchema } from '../../workflow/node';

const nullishToUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => v ?? undefined, schema);

const WebCompletionsSchema = z.object({
  chatId: nullishToUndefined(z.string().max(1024).optional()).meta({
    description: '聊天ID, 传入的话会自动获取历史记录，不传入则认为是新对话'
  }),
  appId: nullishToUndefined(ObjectIdSchema.optional()),
  customUid: nullishToUndefined(z.string().max(1024).optional()).meta({
    description: '自定义用户ID(分享链接)'
  }),
  metadata: nullishToUndefined(z.record(z.string(), z.any()).optional()).meta({
    description: '元数据'
  })
});

// completions 接口实际上并没有用完所有字段，所以这里就取局部即可
const ChatCompletionCreateParamsSchema = z.object({
  messages: nullishToUndefined(z.array(ChatCompletionMessageParamSchema).default([])).meta({
    description: '消息列表'
  }),
  stream: nullishToUndefined(z.boolean().default(false)).meta({
    description: '是否流式返回'
  })
});

export const CompletionsPropsSchema = OutLinkChatAuthSchema.extend(WebCompletionsSchema.shape)
  .extend(ChatCompletionCreateParamsSchema.shape)
  .extend({
    variables: nullishToUndefined(z.record(z.string(), z.any()).default({})).meta({
      description: '全局变量或插件输入'
    }),
    responseChatItemId: nullishToUndefined(
      z
        .string()
        .default(() => getNanoid())
        .meta({
          description: '自定义响应的 assistant 的消息 ID，如果不传入，则自动生成一个'
        })
    ),
    detail: nullishToUndefined(z.boolean().default(false)).meta({
      description: '是否返回详细信息，包括 reasoning_content, tool_calls, usage 等'
    }),
    retainDatasetCite: nullishToUndefined(z.boolean().default(false)).meta({
      description: '是否保留数据集引用'
    }),
    showSkillReferences: nullishToUndefined(z.boolean().default(false)).meta({
      description: '是否显示技能引用'
    })
  });
export type CompletionsProps = z.infer<typeof CompletionsPropsSchema>;

/* =============== Response =============== */

const ChatCompletionResponseMessageSchema = z.object({
  role: z.literal('assistant').meta({ description: '消息角色' }),
  content: z.any().meta({
    description:
      '消息内容。普通对话为字符串；detail=true 或工作流命中交互节点时，可能为带 type 字段的对象数组（type 取值: text / interactive / tool / file / reasoning）'
  }),
  reasoning_content: z.string().optional().meta({ description: '思考过程内容（仅推理模型有）' })
});

const ChatCompletionChoiceSchema = z.object({
  message: ChatCompletionResponseMessageSchema.meta({ description: '助手消息' }),
  finish_reason: z.string().meta({ description: '完成原因，例如 stop' }),
  index: z.number().meta({ description: '选项索引' })
});

const ChatCompletionUsageSchema = z.object({
  prompt_tokens: z
    .literal(1)
    .meta({ description: '固定为 1，需要从 detail 中计算每一个节点的token数' }),
  completion_tokens: z
    .literal(1)
    .meta({ description: '固定为 1，需要从 detail 中计算每一个节点的token数' }),
  total_tokens: z
    .literal(1)
    .meta({ description: '固定为 1，需要从 detail 中计算每一个节点的token数' })
});

export const CompletionsResponseSchema = z.object({
  id: z.string().meta({ description: '对话 ID（chatId）' }),
  model: z.literal('').meta({ description: '模型名称，v1 接口固定为空字符串' }),
  usage: ChatCompletionUsageSchema.meta({
    description: 'Token 用量。v1 接口为占位值，需要时请从 responseData 计算'
  }),
  choices: z.array(ChatCompletionChoiceSchema).meta({ description: '回复选项列表' }),
  responseData: z.array(z.any()).optional().meta({
    description:
      '各节点详细响应数据（仅 detail=true 时返回）。每项是一个节点的执行结果，常见字段如 moduleName / moduleType / runningTime / quoteList 等'
  }),
  newVariables: z
    .record(z.string(), z.any())
    .optional()
    .meta({ description: '工作流执行后更新的变量（仅 detail=true 时返回）' })
});
export type CompletionsResponseType = z.infer<typeof CompletionsResponseSchema>;

export const AuthResponseSchema = z.object({
  teamId: ObjectIdSchema.meta({ description: '团队ID' }),
  tmbId: ObjectIdSchema.meta({ description: '团队成员ID' }),
  app: AppSchemaTypeSchema.meta({ description: '应用' }),
  showCite: z.boolean().default(false).optional().meta({
    description: '是否显示引用'
  }),
  showRunningStatus: z.boolean().default(false).optional().meta({
    description: '是否显示运行状态'
  }),
  showSkillReferences: z.boolean().default(false).optional().meta({
    description: '是否显示技能引用'
  }),
  authType: z.enum(AuthUserTypeEnum).meta({ description: '认证类型' }),
  apikey: z.string().optional().meta({ description: 'API密钥' }),
  responseAllData: z.boolean().meta({
    description: '是否返回所有数据'
  }),
  outLinkUserId: z.string().optional().meta({ description: '外部链接用户ID' }),
  sourceName: z.string().optional().meta({ description: '来源名称' })
});
export type AuthResponseType = z.infer<typeof AuthResponseSchema>;

/* ====== Chat test ====== */
export const ChatTestPropsSchema = z.object({
  messages: z.array(ChatCompletionMessageParamSchema).meta({ description: '消息列表' }),
  responseChatItemId: z
    .string()
    .nullish()
    .meta({ description: '自定义响应的 assistant 的消息 ID，如果不传入，则自动生成一个' }),
  nodes: z.array(OpenAPIStoreNodeItemTypeSchema).meta({ description: '节点列表' }),
  edges: z.array(StoreEdgeItemTypeSchema).meta({ description: '边列表' }),
  chatConfig: AppChatConfigTypeSchema.meta({ description: '聊天配置' }),
  variables: nullishToUndefined(z.record(z.string(), z.any()).default({})).meta({
    description: '全局变量或插件输入'
  }),
  appId: ObjectIdSchema.meta({ description: '应用ID' }),
  appName: z.string().meta({ description: '应用名称' }),
  chatId: z.string().meta({ description: '聊天ID' })
});
export type ChatTestPropsType = z.infer<typeof ChatTestPropsSchema>;
