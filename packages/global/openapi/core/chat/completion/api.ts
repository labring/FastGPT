import { ChatIdSchema } from '../../../../core/chat/schema';
import { ChatAuthProxySchema } from '../../../../support/permission/chat';
import { withChatApiIdentity } from '../identity';
import { ChatPublishSourceSchema } from '../../../../core/chat/publishSource/type';
import { OpenObjectOpenApiMeta } from '../../../../common/zod/openapi';
import z from 'zod';
import type { ZodOpenApiMetadata } from 'zod-openapi';
import { ObjectIdSchema } from '../../../../common/type/mongo';
import { ChatCompletionMessageParamSchema } from '../../../../core/ai/llm/type';
import { getNanoid } from '../../../../common/string/tools';
import { AppSchemaTypeSchema } from '../../../../core/app/type';
import { AuthUserTypeEnum } from '../../../../support/permission/constant';
import { OutLinkChatAuthSchema } from '../../../../support/permission/chat';
import {
  CanonicalSelectedToolsValueSchema,
  CanonicalWorkflowDataSchema
} from '../../../../core/workflow/migration';
import { NodeInputKeyEnum } from '../../../../core/workflow/constants';
import {
  OpenAPIFlowNodeInputItemTypeSchema,
  OpenAPIStoreNodeItemTypeSchema
} from '../../workflow/node';
import { AppChatConfigInputSchema } from '../../app/common/api';
import { optionalNullToUndefined } from '../../../../common/zod';

/** 带默认值的字段仅归一空值，保留原 Schema 的必填输出类型和默认值。 */
const nullishToUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => value ?? undefined, schema);

const ChatTestNodeInputSchema = OpenAPIFlowNodeInputItemTypeSchema.superRefine((input, ctx) => {
  if (input.key !== NodeInputKeyEnum.selectedTools || input.value === undefined) return;

  const result = CanonicalSelectedToolsValueSchema.safeParse(input.value);
  if (result.success) return;

  result.error.issues.forEach((issue) => {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['value', ...issue.path],
      message: issue.message
    });
  });
});

const ChatTestNodeSchema = OpenAPIStoreNodeItemTypeSchema.safeExtend({
  inputs: z.array(ChatTestNodeInputSchema)
});

const WebCompletionsSchema = z.object({
  chatId: z
    .preprocess(
      (value) =>
        value === null || value === undefined || (typeof value === 'string' && !value.trim())
          ? undefined
          : value,
      ChatIdSchema.default(() => getNanoid(24))
    )
    .meta({
      description: '会话 ID；未传入或传入空字符串时自动生成新会话 ID'
    }),
  customUid: optionalNullToUndefined(z.string().max(1024)).meta({
    example: 'customer-42',
    description:
      'API Key 调用时由接入方后端提供的使用者 ID，FastGPT 4.18.0 及以上支持，最长 1024 字符；不改变鉴权成员，与 authProxy 互斥。新会话空字符串沿用默认使用者；已有会话必须与首次使用者一致，已绑定 customUid 后漏传、传空或更换均拒绝；分享链接使用 outLinkAuthData.outLinkUid，不使用此字段'
  }),
  metadata: optionalNullToUndefined(z.record(z.string(), z.any())).meta({
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

const CompletionsBodySchema = WebCompletionsSchema.extend({
  ...ChatCompletionCreateParamsSchema.shape,
  authProxy: optionalNullToUndefined(ChatAuthProxySchema).meta({
    description:
      'API Key 代理调用身份，与 customUid 互斥，外链会话不支持。按团队成员 ID 或用户名指定；二者同时传入时优先使用 tmbId，解析时过滤 username；tmbId 无效时不回退到用户名'
  }),
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

/**
 * Completions 仅支持应用和外链会话，身份字段先于公共运行参数展示。
 * 应用 ID 允许由 API Key 请求头补足；外链优先并忽略 appId，但无效外链数据不得回退。
 */
export const CompletionsPropsSchema = z.union([
  withChatApiIdentity(
    z
      .object({
        appId: ObjectIdSchema.meta({
          example: '68ad85a7463006c963799a05',
          description:
            '应用 ID。APP API Key 忽略该字段及 SDK 后缀，以 Key 绑定应用为准；个人密钥按 body.appId > Authorization 的 key-appId 后缀解析。后缀不写入数据库'
        }),
        outLinkAuthData: optionalNullToUndefined(z.never()),
        ...CompletionsBodySchema.shape
      })
      .meta({
        title: '应用会话',
        description:
          '通过 appId 定位应用，使用 API Key 或登录态鉴权。API Key 调用可省略 body.appId，由请求头的 apiKey-appId 后缀或旧 API Key 绑定应用补足；登录态调用必须传 appId。应用 Key 不支持代理团队成员。'
      } satisfies ZodOpenApiMetadata),
    { completion: true, showProxy: true, hideFields: ['outLinkAuthData'] }
  ),
  withChatApiIdentity(
    z
      .object({
        appId: optionalNullToUndefined(z.never()),
        outLinkAuthData: optionalNullToUndefined(z.never()),
        ...CompletionsBodySchema.shape
      })
      .meta({
        title: 'APP API Key（无需 appId）',
        description:
          '使用绑定应用的 APP API Key 时不需要 appId，直接使用 Key 的绑定；身份支持默认身份或 customUid，不支持 authProxy。兼容个人密钥的 OpenAI SDK key-appId 后缀，其代理身份规则同应用会话；普通个人密钥或登录态必须显式提供 appId。'
      } satisfies ZodOpenApiMetadata),
    { completion: true, showProxy: false, hideFields: ['appId', 'outLinkAuthData'] }
  ),
  z
    .object({
      outLinkAuthData: OutLinkChatAuthSchema.meta({
        description:
          '外链鉴权对象，包含 shareId 和 outLinkUid。优先于 appId，忽略低优先级字段；允许同时携带 token/Cookie，受保护外链仍需校验登录态。'
      }),
      appId: z.never().optional().catch(undefined),
      ...CompletionsBodySchema.shape
    })
    .meta({
      title: '外链会话',
      description:
        '通过 outLinkAuthData 解析真实应用，使用者由 outLinkUid 及外链鉴权结果决定；优先于 appId 和请求头身份，受保护外链仍需 token/Cookie 校验登录态。外链校验失败时不会回退到普通应用鉴权，且不支持 authProxy。',
      override: ({ jsonSchema }) => {
        // 外链身份由分享鉴权决定，不展示无效的应用调用身份参数；保留运行时校验兼容。
        delete jsonSchema.properties?.customUid;
        delete jsonSchema.properties?.authProxy;
      }
    } satisfies ZodOpenApiMetadata)
]);
export type CompletionsProps = z.infer<typeof CompletionsPropsSchema>;

/* =============== Response =============== */

const ChatCompletionResponseMessageSchema = z.object({
  role: z.literal('assistant').meta({ description: '消息角色' }),
  content: z.any().meta({
    anyOf: [{ type: 'string' }, { type: 'array', items: OpenObjectOpenApiMeta }],
    description:
      '消息内容。普通对话为字符串；detail=true 或工作流命中交互节点时，可能为按字段名区分的对象数组（如 text / interactive / tool / file / reasoning）。v1 会额外补充 type 字段，取值为 text / interactive / tool / file / reasoning；v2 不补充 type。当元素包含 interactive 字段时，只返回交互展示配置，不返回 entryNodeIds / memoryEdges / nodeOutputs 等内部运行态字段'
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
  title: z.string().optional().meta({ description: '未命名会话标题生成成功时返回的对话标题' }),
  model: z.literal('').meta({ description: '模型名称，v1 接口固定为空字符串' }),
  usage: ChatCompletionUsageSchema.meta({
    description: 'Token 用量。v1 接口为占位值，需要时请从 responseData 计算'
  }),
  choices: z.array(ChatCompletionChoiceSchema).meta({ description: '回复选项列表' }),
  responseData: z.array(z.any()).optional().meta({
    items: OpenObjectOpenApiMeta,
    description:
      '各节点详细响应数据（仅 detail=true 时返回）。每项是一个节点的执行结果，常见字段如 moduleName / moduleType / runningTime / quoteList 等'
  }),
  newVariables: z
    .record(z.string(), z.any())
    .optional()
    .meta({ description: '工作流执行后更新的变量（仅 detail=true 时返回）' })
});
export type CompletionsResponseType = z.infer<typeof CompletionsResponseSchema>;

/* =============== Shared workflow SSE response =============== */

export const ChatWorkflowSseResponseSchema = z.string().meta({
  example: 'event: answer\ndata: {"choices":[...]}\n\n',
  description:
    '工作流 SSE 事件流；根据接口版本和 detail 配置返回 answer、flowNodeResponse、interactive 等事件，最后以 [DONE] 结束。同会话已有生成时，error 事件的 statusText 为 chatIsGenerating，data.responseChatItemId 提供当前服务端 AI 消息 ID；交互续跑返回 data.reusePreviousAi=true，表示刷新并复用最新 AI。本次被拒绝的消息未写入数据库，客户端应回填输入并恢复原有轮次。'
});
export type ChatWorkflowSseResponseType = z.infer<typeof ChatWorkflowSseResponseSchema>;

export const AuthResponseSchema = z.object({
  publishSource: ChatPublishSourceSchema.optional(),
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
  canReadModerationRecords: z.boolean().optional().meta({
    description: '是否具有应用写权限，可查看节点审核详情；未提供时不开放'
  }),
  responseAllData: z.boolean().meta({
    description: '是否返回所有数据'
  }),
  outLinkUserId: z.string().optional().meta({ description: '外部链接用户ID' }),
  sourceName: z.string().optional().meta({ description: '来源名称' })
});
export type AuthResponseType = z.infer<typeof AuthResponseSchema>;

/* ====== Chat test ====== */
export const ChatTestPropsSchema = z.object({
  messages: z.array(ChatCompletionMessageParamSchema).meta({
    example: [{ role: 'user', content: '你好' }],
    description: '消息列表，最后一条消息作为本次用户问题'
  }),
  responseChatItemId: z.string().nullish().meta({
    example: 'response-chat-item-id',
    description: '自定义响应消息 ID，不传时自动生成'
  }),
  nodes: z.array(ChatTestNodeSchema).meta({
    example: [],
    description: '临时执行的工作流节点列表'
  }),
  edges: CanonicalWorkflowDataSchema.shape.edges.meta({
    example: [],
    description: '临时执行的工作流连线列表'
  }),
  chatConfig: AppChatConfigInputSchema.meta({
    example: {},
    description: '当前格式的聊天配置'
  }),
  variables: nullishToUndefined(z.record(z.string(), z.any()).default({})).meta({
    example: {},
    description: '全局变量或插件输入'
  }),
  appId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a05',
    description: '应用 ID'
  }),
  appName: z.string().meta({
    example: '主页助手',
    description: '应用名称'
  }),
  chatId: ChatIdSchema.meta({
    example: 'chat-id',
    description: '会话 ID'
  })
});
export type ChatTestPropsType = z.infer<typeof ChatTestPropsSchema>;

/* ============================================================================
 * API: 应用聊天及工作流执行
 * Route: POST /api/proApi/core/chat/chatHome
 * Method: POST
 * Description: 使用主页聊天配置和临时工作流执行一次应用对话，返回 SSE 流。
 * Tags: ['会话操作', 'Write']
 * ============================================================================ */

export const ChatHomeBodySchema = ChatTestPropsSchema.extend({
  retainDatasetCite: z.boolean().optional().meta({
    example: true,
    description: '是否保留知识库引用信息'
  }),
  showSkillReferences: z.boolean().optional().meta({
    example: true,
    description: '是否返回技能引用信息'
  })
}).meta({
  description: '主页聊天使用的应用工作流和运行参数'
});
export type ChatHomeBodyType = z.infer<typeof ChatHomeBodySchema>;
