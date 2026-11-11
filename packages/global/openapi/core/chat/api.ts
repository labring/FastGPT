import { ChatAuthProxySchema, ChatAuthProxyQuerySchema } from '../../../support/permission/chat';
import { withChatApiIdentity } from './identity';
import { ObjectIdSchema } from '../../../common/type/mongo';
import { ChatGenerateStatusEnum, ChatSourceTypeEnum } from '../../../core/chat/constants';
import { isAuxiliaryGenerationSourceType } from '../../../common/chat/source';
import {
  OutLinkChatAuthSchema,
  OutLinkChatAuthQuerySchema,
  parseOutLinkChatAuthInput,
  type OutLinkChatAuthProps
} from '../../../support/permission/chat';
import z from 'zod';
import type { ZodOpenApiMetadata } from 'zod-openapi';
import { createPaginationSchema } from '../../api';

export const ChatGenerateStatusSchema = z
  .enum(ChatGenerateStatusEnum)
  .describe('由 Redis 生成租约计算的运行状态：0=generating（生成中），1=done（空闲）');

/** 管理请求不能用空值悄悄取消使用者约束；省略字段才保留原访问范围。 */
const ChatCustomUidSchema = z.string().min(1).max(1024).optional().meta({
  example: 'customer-42',
  description:
    '仅普通应用的 API Key 调用支持。精确匹配对话的外部使用者 ID（outLinkUid），不匹配 tmbId；省略时保留原访问范围，传入时限制读取、修改及删除。最长 1024 字符，不接受空字符串或 null，不改变鉴权成员。'
});

const ChatUserIdentityInputShape = {
  customUid: ChatCustomUidSchema,
  authProxy: ChatAuthProxySchema.optional()
};

const NoChatUserIdentityShape = {
  customUid: z.never().optional(),
  authProxy: z.never().optional()
};

const ChatTargetInputShape = {
  appId: ObjectIdSchema.optional().meta({
    example: '68ad85a7463006c963799a05',
    description: '应用 ID，使用接口允许的请求头凭证鉴权。'
  }),
  skillId: ObjectIdSchema.optional().meta({
    example: '68ad85a7463006c963799a06',
    description: 'Skill Edit 调试 ID，使用接口允许的请求头凭证鉴权。'
  }),
  sourceType: z
    .enum([
      ChatSourceTypeEnum.app,
      ChatSourceTypeEnum.chatAgentHelper,
      ChatSourceTypeEnum.workflowBuilder
    ])
    .optional()
    .meta({
      example: ChatSourceTypeEnum.chatAgentHelper,
      description: 'appId 对应的会话资源类型。缺省为 App 会话；辅助生成会话传对应 sourceType。'
    })
};

type ChatTargetInput = {
  appId?: unknown;
  sourceId?: unknown;
  skillId?: unknown;
  sourceType?: unknown;
  outLinkAuthData?: unknown;
  [key: string]: unknown;
};

export type ChatTargetInputType =
  | {
      appId: string;
      skillId?: never;
      sourceType?: ChatSourceTypeEnum.app;
    }
  | {
      appId?: never;
      skillId: string;
      sourceType?: never;
    }
  | {
      appId: string;
      skillId?: never;
      sourceType: ChatSourceTypeEnum.chatAgentHelper;
    }
  | {
      appId: string;
      skillId?: never;
      sourceType: ChatSourceTypeEnum.workflowBuilder;
    };
export type ChatTargetResponseType = ChatTargetInputType;

const getNestedOutLinkAuthData = (data: ChatTargetInput) => {
  const outLinkAuthData = parseOutLinkChatAuthInput(data.outLinkAuthData);

  if (!outLinkAuthData || typeof outLinkAuthData !== 'object') {
    return {};
  }

  return outLinkAuthData as {
    shareId?: unknown;
    outLinkUid?: unknown;
  };
};

const getNormalizedOutLinkAuthData = (data: ChatTargetInput): OutLinkChatAuthProps | undefined => {
  const nestedAuthData = getNestedOutLinkAuthData(data);
  const authData = {
    shareId: nestedAuthData.shareId,
    outLinkUid: nestedAuthData.outLinkUid
  } as OutLinkChatAuthProps;

  return Object.values(authData).some(Boolean) ? authData : undefined;
};

export const ChatTargetResponseSchema = z.union([
  z.object({
    appId: ObjectIdSchema.describe('应用 ID，仅工作流辅助生成会话返回'),
    skillId: z.undefined().optional(),
    sourceType: z.literal(ChatSourceTypeEnum.workflowBuilder).describe('工作流辅助生成会话资源类型')
  }),
  z.object({
    appId: ObjectIdSchema.describe('应用 ID，仅 ChatAgentHelper 会话返回'),
    skillId: z.undefined().optional(),
    sourceType: z
      .literal(ChatSourceTypeEnum.chatAgentHelper)
      .describe('ChatAgentHelper 会话资源类型')
  }),
  z.object({
    appId: ObjectIdSchema.describe('应用 ID，仅 App 会话返回'),
    skillId: z.undefined().optional()
  }),
  z.object({
    appId: z.undefined().optional(),
    skillId: ObjectIdSchema.describe('Skill Edit 调试 ID，仅 Skill Edit 会话返回')
  })
]);

/**
 * 将内部标准 chat source 转换为对外 API target 返回值。
 *
 * API handler 内部统一使用 `sourceType/sourceId`；返回到 OpenAPI 边界时恢复为
 * `appId/skillId`，与请求入参保持同一套对外协议。
 */
export const buildChatTargetResponse = ({
  sourceType,
  sourceId
}: {
  sourceType: ChatSourceTypeEnum;
  sourceId: string | { toString(): string };
}): ChatTargetResponseType => {
  const id = String(sourceId);

  if (sourceType === ChatSourceTypeEnum.app) {
    return { appId: id };
  }

  if (sourceType === ChatSourceTypeEnum.skillEdit) {
    return { skillId: id };
  }

  if (sourceType === ChatSourceTypeEnum.chatAgentHelper) {
    return { appId: id, sourceType: ChatSourceTypeEnum.chatAgentHelper };
  }

  if (sourceType === ChatSourceTypeEnum.workflowBuilder) {
    return { appId: id, sourceType: ChatSourceTypeEnum.workflowBuilder };
  }

  const exhaustiveCheck: never = sourceType;
  throw new Error(`Unsupported chat source type: ${exhaustiveCheck}`);
};

/** 构造带 appId/skillId 互斥返回字段的 OpenAPI response schema。 */
export const createChatTargetResponseSchema = <T extends z.ZodRawShape>(shape: T) =>
  z.intersection(z.object(shape), ChatTargetResponseSchema);

/** 只解析资源来源；必填、互斥和外链组合继续由各 raw schema 校验。 */
const resolveChatSourceType = ({ skillId, sourceType }: ChatTargetInput) => {
  if (skillId) return ChatSourceTypeEnum.skillEdit;
  return isAuxiliaryGenerationSourceType(sourceType) ? sourceType : ChatSourceTypeEnum.app;
};

/**
 * 将对外 API 的 chat target 互斥入参转换为内部标准 chat source。
 *
 * 该函数只用于 runtime schema 的 `.transform(...)`，OpenAPI path 必须继续注册
 * raw schema，避免文档暴露内部 `sourceType/sourceId`。
 */
export const transformChatTargetInput = <T extends ChatTargetInput>(data: T) => {
  const { appId, skillId, sourceType: rawSourceType, ...rest } = data;
  const sourceId = (appId || skillId) as string | undefined;

  return {
    ...rest,
    sourceType: resolveChatSourceType({ skillId, sourceType: rawSourceType }),
    sourceId
  };
};

/**
 * 将包含授权上下文的 chat target 转换为内部 source。
 *
 * share-only 模式没有显式 appId，运行时先输出 `sourceType=app/sourceId=undefined`；
 * 外链上下文统一收敛到 `outLinkAuthData`，再由 `authChatTargetCrud` 解析真实 sourceId。
 */
export const transformChatAuthTargetInput = <T extends ChatTargetInput>(data: T) => {
  const { appId, skillId, sourceType: rawSourceType, ...rest } = data;
  delete rest.outLinkAuthData;
  const sourceId = (appId || skillId) as string | undefined;
  const normalizedOutLinkAuthData = getNormalizedOutLinkAuthData(data);
  const hasShareAuth = !!(
    normalizedOutLinkAuthData?.shareId && normalizedOutLinkAuthData?.outLinkUid
  );

  if (!sourceId && hasShareAuth) {
    return {
      ...rest,
      outLinkAuthData: normalizedOutLinkAuthData,
      sourceType: ChatSourceTypeEnum.app,
      sourceId
    };
  }

  return {
    ...rest,
    ...(normalizedOutLinkAuthData ? { outLinkAuthData: normalizedOutLinkAuthData } : {}),
    sourceType: resolveChatSourceType({ skillId, sourceType: rawSourceType }),
    sourceId
  };
};

/**
 * 可选 chat target 的转换函数。
 *
 * 仅用于外链或应用 Key 等允许从鉴权上下文推导 App 的接口；如果传入了 target，仍会转换为内部
 * `sourceType/sourceId`。
 */
export const transformOptionalChatTargetInput = <T extends ChatTargetInput>(data: T) => {
  const { appId, skillId, sourceType: rawSourceType, ...rest } = data;
  delete rest.outLinkAuthData;
  const sourceId = (appId || skillId) as string | undefined;
  const normalizedOutLinkAuthData = getNormalizedOutLinkAuthData(data);
  const hasShareAuth = !!(
    normalizedOutLinkAuthData?.shareId && normalizedOutLinkAuthData?.outLinkUid
  );

  if (!sourceId && hasShareAuth) {
    return {
      ...rest,
      outLinkAuthData: normalizedOutLinkAuthData,
      sourceType: ChatSourceTypeEnum.app,
      sourceId: undefined
    };
  }

  return {
    ...rest,
    ...(normalizedOutLinkAuthData ? { outLinkAuthData: normalizedOutLinkAuthData } : {}),
    ...(appId || skillId
      ? {
          sourceType: resolveChatSourceType({ skillId, sourceType: rawSourceType }),
          sourceId: sourceId!
        }
      : {
          sourceType: undefined,
          sourceId: undefined
        })
  };
};

/** 包含授权上下文、且允许缺省 target 的转换函数。 */
export const transformOptionalChatAuthTargetInput = transformOptionalChatTargetInput;

/** 应用 Key 的无 appId 分支只描述请求形态，真实凭证类型必须由服务端鉴权确认。 */
const appApiKeyTargetMeta = {
  title: '应用 API Key（无需 appId）',
  description:
    'Authorization 使用绑定应用的 APP API Key 时无需传 appId 或 sourceType，服务端从 Key 绑定取得应用，sourceType 固定为 app。个人密钥和登录态不能使用此省略方式；显式传入 appId 时仍以 Key 绑定为准。',
  override: ({ jsonSchema }) => {
    delete jsonSchema.properties?.appId;
    delete jsonSchema.properties?.skillId;
    delete jsonSchema.properties?.shareId;
    delete jsonSchema.properties?.outLinkUid;
    delete jsonSchema.properties?.sourceType;
  }
} satisfies ZodOpenApiMetadata;

/** 只包含 appId 的对话接口也使用相同 union；省略分支只接受未传 appId 的形态，显式传值由原分支校验格式。 */
export const createAppApiKeyInputSchema = <T extends z.ZodRawShape>(schema: z.ZodObject<T>) =>
  z.union([
    schema.meta({
      ...schema.meta(),
      title: '显式指定应用',
      description: '个人密钥或登录态必须传 appId；应用 Key 始终以 Key 绑定的应用为准。'
    }),
    schema.extend({ appId: z.never().optional() }).meta(appApiKeyTargetMeta)
  ]);

/** 不适用的分支显式拒绝此字段，并在文档中隐藏不可用的参数。 */
const hideCustomUidMeta = {
  override: ({ jsonSchema }) => {
    delete jsonSchema.properties?.customUid;
    delete jsonSchema.properties?.authProxy;
  }
} satisfies ZodOpenApiMetadata;

/**
 * 按 skillId > appId 选择资源分支，缺失目标仅供应用 Key 从绑定解析。
 * catch(undefined) 只忽略低优先级字段；显式传入无效的 skillId 时不得回退到 appId。
 */
const createChatTargetBranches = <T extends z.ZodRawShape>(schema: z.ZodObject<T>) =>
  [
    schema
      .extend({
        appId: ChatTargetInputShape.appId.nonoptional(),
        skillId: z.never().optional(),
        sourceType: ChatTargetInputShape.sourceType
      })
      .meta({
        title: '应用会话',
        description:
          '通过 appId 定位会话。接口同时支持 API Key 和登录态时，Authorization 优先于 token/Cookie。'
      }),
    schema
      .extend({
        appId: z.never().optional().catch(undefined),
        skillId: ChatTargetInputShape.skillId.nonoptional(),
        sourceType: z.never().optional().catch(undefined)
      })
      .meta({
        ...hideCustomUidMeta,
        title: 'Skill 调试会话',
        description:
          '通过 skillId 定位调试会话，优先于 appId 并忽略其 sourceType，使用接口允许的请求头凭证鉴权。'
      }),
    schema
      .extend({
        appId: z.never().optional(),
        skillId: z.never().optional(),
        sourceType: z.literal(ChatSourceTypeEnum.app).optional(),
        source: z.never().optional(),
        shareId: z.never().optional(),
        outLinkUid: z.never().optional()
      })
      .meta(appApiKeyTargetMeta)
  ] as const;

/**
 * 按 outLinkAuthData > skillId > appId 兼容混合入参，并补充应用 Key 的省略目标分支。
 * 低优先级分支保留 never 守卫，外链格式错误时不能吞掉错误并回退为普通资源访问。
 */
const createOutLinkChatTargetBranches = <T extends z.ZodRawShape, TAuth extends z.ZodType>(
  shape: T,
  authSchema: TAuth,
  query = false
) => {
  const outLinkAuthData = authSchema.describe(
    `${authSchema.description ?? '外链鉴权数据，包含 shareId/outLinkUid。'}优先于 skillId 和 appId，忽略低优先级字段；允许同时携带 token/Cookie，受保护外链仍需校验登录态。`
  );
  const schema = z.object({
    ...ChatUserIdentityInputShape,
    ...ChatTargetInputShape,
    outLinkAuthData: outLinkAuthData.optional(),
    ...shape,
    authProxy: (query ? ChatAuthProxyQuerySchema : ChatAuthProxySchema).optional()
  });
  const [app, skill, appApiKey] = createChatTargetBranches(schema);
  return [
    app.extend({ outLinkAuthData: z.never().optional() }).meta(app.meta() ?? {}),
    skill
      .extend({ ...NoChatUserIdentityShape, outLinkAuthData: z.never().optional() })
      .meta(skill.meta() ?? {}),
    schema
      .extend({
        appId: z.never().optional().catch(undefined),
        skillId: z.never().optional().catch(undefined),
        sourceType: z.never().optional().catch(undefined),
        outLinkAuthData,
        customUid: z.never().optional(),
        authProxy: z.never().optional()
      })
      .meta({
        ...hideCustomUidMeta,
        title: '外链会话',
        description:
          '通过 outLinkAuthData 解析真实应用，优先于 skillId 和 appId 并忽略其 sourceType。外链身份优先于请求头身份；token/Cookie 可以同时传入，受保护外链仍会校验登录态。外链校验失败时不会回退到普通资源鉴权。'
      }),
    appApiKey.extend({ outLinkAuthData: z.never().optional() }).meta(appApiKeyTargetMeta)
  ] as const;
};

/** 没有会话上下文时，引用数据等接口按资源自身权限访问，禁止吞掉无效的显式 target。 */
const createNoChatTargetSchema = <T extends z.ZodRawShape>(shape: T) =>
  z
    .object({
      ...ChatTargetInputShape,
      ...shape,
      appId: z.never().optional(),
      skillId: z.never().optional(),
      customUid: z.never().optional(),
      authProxy: z.never().optional(),
      sourceType: z.never().optional(),
      outLinkAuthData: z.never().optional()
    })
    .meta({
      ...hideCustomUidMeta,
      title: '直接访问资源',
      description:
        '不使用会话上下文，按资源自身权限鉴权；不接受 customUid、authProxy 等会话身份字段。',
      override: (context) => {
        hideCustomUidMeta.override(context);
        const { jsonSchema } = context;
        // never 字段会在文档中隐藏，另保留禁止出现的约束，不能让身份请求匹配直接访问分支。
        jsonSchema.not = {
          anyOf: [
            'appId',
            'skillId',
            'customUid',
            'authProxy',
            'sourceType',
            'outLinkAuthData'
          ].map((key) => ({ required: [key] }))
        };
      }
    } satisfies ZodOpenApiMetadata);

/** 资源 target 共用具名 union，兼容 skillId 优先；运行时转换为 sourceType/sourceId。 */
export const createChatTargetInputSchema = <T extends z.ZodRawShape>(
  shape: T,
  { allowAppApiKey = true }: { allowAppApiKey?: boolean } = {}
) => {
  const [app, skill, appApiKey] = createChatTargetBranches(
    z.object({ ...ChatUserIdentityInputShape, ...ChatTargetInputShape, ...shape })
  );
  return z.union([
    withChatApiIdentity(app),
    skill.extend(NoChatUserIdentityShape).meta(skill.meta() ?? {}),
    ...(allowAppApiKey ? [withChatApiIdentity(appApiKey, { showProxy: false })] : [])
  ]);
};

/** 资源管理接口只解析目标，不解析会话使用者身份。 */
export const createChatManagementTargetInputSchema = <T extends z.ZodRawShape>(shape: T) =>
  z.union(createChatTargetBranches(z.object({ ...ChatTargetInputShape, ...shape })));

/** 不含外链的 Query 同样用 JSON 字符串传递代理身份。 */
export const createChatTargetQuerySchema = <T extends z.ZodRawShape>(shape: T) => {
  const [app, skill, appKey] = createChatTargetBranches(
    z.object({
      ...ChatUserIdentityInputShape,
      ...ChatTargetInputShape,
      ...shape,
      authProxy: ChatAuthProxyQuerySchema.optional()
    })
  );
  return z.union([
    withChatApiIdentity(app, { query: true }),
    skill.extend(NoChatUserIdentityShape).meta(skill.meta() ?? {}),
    withChatApiIdentity(appKey, { query: true, showProxy: false })
  ]);
};

/** 用于可以直接按资源权限访问、也可以携带会话上下文的接口。 */
export const createOptionalChatTargetInputSchema = <T extends z.ZodRawShape>(shape: T) =>
  z.union([createNoChatTargetSchema(shape), ...createChatTargetInputSchema(shape).options]);

/** 外链、Skill、App 按原优先级选择，应用 Key 可省略目标；登录态可与外链数据共存。 */
export const createOutLinkChatTargetInputSchema = <T extends z.ZodRawShape>(
  shape: T,
  { requiredIdentityFields = [] }: { requiredIdentityFields?: string[] } = {}
) =>
  (() => {
    const [app, skill, share, appKey] = createOutLinkChatTargetBranches(
      shape,
      OutLinkChatAuthSchema
    );
    return z.union([
      withChatApiIdentity(app, { requiredIdentityFields }),
      skill,
      share,
      withChatApiIdentity(appKey, { showProxy: false, requiredIdentityFields })
    ]);
  })();

/** Query 使用 JSON 字符串传输外链身份，解析后仍复用对象身份与相同的分支优先级。 */
export const createOutLinkChatTargetQuerySchema = <T extends z.ZodRawShape>(shape: T) =>
  (() => {
    const [app, skill, share, appKey] = createOutLinkChatTargetBranches(
      shape,
      OutLinkChatAuthQuerySchema,
      true
    );
    return z.union([
      withChatApiIdentity(app, { query: true }),
      skill,
      share,
      withChatApiIdentity(appKey, { query: true, showProxy: false })
    ]);
  })();

/** 资源直接访问或会话上下文；错误的显式鉴权数据不会降级为直接访问。 */
export const createOptionalOutLinkChatTargetInputSchema = <T extends z.ZodRawShape>(
  shape: T,
  options: { requiredIdentityFields?: string[] } = {}
) =>
  z.union([
    createNoChatTargetSchema(shape),
    ...createOutLinkChatTargetInputSchema(shape, options).options
  ]);

/** 先选择会话身份，再展示分页方式及参数，最后展示业务筛选；保留身份优先级和 offset 优先规则。 */
export const createPaginatedChatTargetInputSchema = <T extends z.ZodRawShape>(shape: T) => {
  const [app, skill, outLink, appApiKey] = createOutLinkChatTargetBranches(
    {},
    OutLinkChatAuthSchema
  );
  const pagination = createPaginationSchema(shape);
  // 筛选字段跟随分页参数展示；应用 Key 不接受来源筛选，校验和文档共用同一约束。
  const appApiKeyFilters = appApiKey
    .extend({ ...shape, source: z.never().optional() })
    .meta(appApiKey.meta() ?? {});
  return z.union([
    withChatApiIdentity(z.intersection(app, pagination).meta(app.meta() ?? {})),
    z.intersection(skill, pagination).meta(skill.meta() ?? {}),
    z.intersection(outLink, pagination).meta(outLink.meta() ?? {}),
    withChatApiIdentity(
      z.intersection(appApiKeyFilters, createPaginationSchema()).meta(appApiKey.meta() ?? {}),
      { showProxy: false }
    )
  ]);
};

/**
 * 将整组会话 Query 注册为 form/explode 对象参数，保留与 Body 一致的 union 分支展示。
 * query 仅是文档参数名，实际仍展开为 appId、skillId、chatId 等独立 Query 键；
 * 运行时继续使用原始 Schema 校验，代码示例由公共生成器取第一个分支。
 */
export const createChatTargetQueryParameters = (schema: z.ZodType) => {
  // zod-openapi 从 optional 包装判断整个参数是否必填；只设 param.required 不会生效。
  const optionalQuery = schema.safeParse({}).success;
  const query = optionalQuery ? schema.optional() : schema;
  return [
    query.meta({
      ...schema.meta(),
      param: {
        name: 'query',
        in: 'query',
        required: !optionalQuery,
        style: 'form',
        explode: true
      }
    })
  ];
};

/**
 * API route runtime schema helper.
 *
 * OpenAPI path 不应直接注册该 schema；它会 transform 输出为内部
 * `sourceType/sourceId`，用于 API handler 之后的业务层调用。
 */
export const withChatTarget = <T extends z.ZodRawShape>(shape: T) =>
  createChatTargetInputSchema(shape).transform(transformChatTargetInput);

/**
 * 少数允许缺省 chat target 的接口使用。必填 target 的标准 chat API
 * 不能使用该 helper，避免绕过 chat target 互斥校验。
 */
export const withOptionalChatTarget = <T extends z.ZodRawShape>(shape: T) =>
  createOptionalChatTargetInputSchema(shape).transform(transformOptionalChatTargetInput);

/** 包含外链鉴权字段的必填 chat target runtime schema helper。 */
export const withOutLinkChatTarget = <T extends z.ZodRawShape>(shape: T) =>
  createOutLinkChatTargetInputSchema(shape).transform(transformChatAuthTargetInput);

/** 包含外链鉴权字段的可选 chat target runtime schema helper。 */
export const withOptionalOutLinkChatTarget = <T extends z.ZodRawShape>(shape: T) =>
  createOptionalOutLinkChatTargetInputSchema(shape).transform(transformOptionalChatAuthTargetInput);

/* Recently Used Apps */
export const GetRecentlyUsedAppsResponseSchema = z.array(
  z.object({
    appId: ObjectIdSchema.describe('应用ID'),
    name: z.string().min(1).describe('应用名称'),
    avatar: z.string().min(1).describe('应用头像')
  })
);
export type GetRecentlyUsedAppsResponseType = z.infer<typeof GetRecentlyUsedAppsResponseSchema>;

/** 兼容旧 sourceType/sourceId 请求，同时公开与其他对话接口一致的应用 Key union。 */
export const createChatSourceInputSchema = <T extends z.ZodRawShape>(shape: T) => {
  const [app, skill, share, appKey] = createOutLinkChatTargetBranches(shape, OutLinkChatAuthSchema);
  const noLegacyId = { sourceId: z.never().optional() };
  return z.union([
    withChatApiIdentity(
      z
        .object({
          ...shape,
          customUid: ChatCustomUidSchema,
          authProxy: ChatAuthProxySchema.optional(),
          sourceType: z.enum(ChatSourceTypeEnum).meta({
            example: ChatSourceTypeEnum.app,
            description: '旧版会话归属资源类型'
          }),
          sourceId: ObjectIdSchema.meta({
            example: '68ad85a7463006c963799a05',
            description: '旧版会话归属资源 ID；应用 Key 仍以绑定应用为准'
          }),
          appId: z.never().optional(),
          skillId: z.never().optional(),
          outLinkAuthData: OutLinkChatAuthSchema.optional()
        })
        .meta({
          title: '兼容 sourceType/sourceId',
          description: '旧客户端显式提供来源类型和资源 ID；应用 Key 始终使用 Key 的绑定应用。'
        })
    ),
    withChatApiIdentity(app.extend(noLegacyId).meta(app.meta() ?? {})),
    skill.extend(noLegacyId).meta(skill.meta() ?? {}),
    share.extend(noLegacyId).meta(share.meta() ?? {}),
    withChatApiIdentity(appKey.extend(noLegacyId).meta(appKey.meta() ?? {}), { showProxy: false })
  ]);
};

/** 只在 API 边界保留旧 source ID 协议；内部始终返回同一组标准来源字段。 */
export const transformChatSourceInput = <T extends ChatTargetInput>(data: T) => {
  if (data.sourceId) {
    const { appId, skillId, ...rest } = data;
    return {
      ...rest,
      sourceType: data.sourceType as ChatSourceTypeEnum,
      sourceId: data.sourceId as string
    };
  }
  return transformChatAuthTargetInput(data);
};
