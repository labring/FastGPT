import { ObjectIdSchema } from '../../../common/type/mongo';
import { ChatGenerateStatusEnum, ChatSourceTypeEnum } from '../../../core/chat/constants';
import { isAuxiliaryGenerationSourceType } from '../../../common/chat/source';
import {
  OutLinkChatAuthSchema,
  parseOutLinkChatAuthInput,
  type OutLinkChatAuthProps
} from '../../../support/permission/chat';
import z from 'zod';
import { createPaginationSchema } from '../../api';

export const ChatGenerateStatusSchema = z
  .enum(ChatGenerateStatusEnum)
  .describe('对话生成状态：0=generating（生成中），1=done（已完成），2=error（生成异常）');

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
  skillId?: unknown;
  sourceType?: unknown;
  outLinkAuthData?: unknown;
  [key: string]: unknown;
};

const OutLinkChatAuthInputShape = {
  outLinkAuthData: OutLinkChatAuthSchema.optional().describe(
    '外链鉴权数据，包含 shareId/outLinkUid。优先于 skillId 和 appId，忽略低优先级字段；允许同时携带 token/Cookie，受保护外链仍需校验登录态。'
  )
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
  const sourceId = (appId || skillId) as string;

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
    sourceId: sourceId!
  };
};

/**
 * 可选 chat target 的转换函数。
 *
 * 仅用于外链等允许从鉴权上下文推导 App 的接口；如果传入了 target，仍会转换为内部
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

/**
 * 按 skillId > appId 选择资源分支，类型和文档仍提示二选一。
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
        title: 'Skill 调试会话',
        description:
          '通过 skillId 定位调试会话，优先于 appId 并忽略其 sourceType，使用接口允许的请求头凭证鉴权。'
      })
  ] as const;

/**
 * 按 outLinkAuthData > skillId > appId 兼容混合入参，文档和输出类型仍提示三选一。
 * 低优先级分支保留 never 守卫，外链格式错误时不能吞掉错误并回退为普通资源访问。
 */
const createOutLinkChatTargetBranches = <T extends z.ZodRawShape>(schema: z.ZodObject<T>) => {
  const [app, skill] = createChatTargetBranches(schema);
  return [
    app.extend({ outLinkAuthData: z.never().optional() }).meta(app.meta() ?? {}),
    skill.extend({ outLinkAuthData: z.never().optional() }).meta(skill.meta() ?? {}),
    schema
      .extend({
        appId: z.never().optional().catch(undefined),
        skillId: z.never().optional().catch(undefined),
        sourceType: z.never().optional().catch(undefined),
        outLinkAuthData: OutLinkChatAuthInputShape.outLinkAuthData.nonoptional()
      })
      .meta({
        title: '外链会话',
        description:
          '通过 outLinkAuthData 解析真实应用，优先于 skillId 和 appId 并忽略其 sourceType。外链身份优先于请求头身份；token/Cookie 可以同时传入，受保护外链仍会校验登录态。外链校验失败时不会回退到普通资源鉴权。'
      })
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
      sourceType: z.never().optional(),
      outLinkAuthData: z.never().optional()
    })
    .meta({ title: '直接访问资源', description: '不使用会话上下文，按资源自身权限鉴权。' });

/** 资源 target 共用具名 union，兼容 skillId 优先；运行时转换为 sourceType/sourceId。 */
export const createChatTargetInputSchema = <T extends z.ZodRawShape>(shape: T) =>
  z.union(createChatTargetBranches(z.object({ ...ChatTargetInputShape, ...shape })));

/** 用于可以直接按资源权限访问、也可以携带会话上下文的接口。 */
export const createOptionalChatTargetInputSchema = <T extends z.ZodRawShape>(shape: T) =>
  z.union([createNoChatTargetSchema(shape), ...createChatTargetInputSchema(shape).options]);

/** 文档提示三选一，运行时按外链、Skill、App 的优先级选择；登录态可与外链数据共存。 */
export const createOutLinkChatTargetInputSchema = <T extends z.ZodRawShape>(shape: T) =>
  z.union(
    createOutLinkChatTargetBranches(
      z.object({
        ...ChatTargetInputShape,
        ...OutLinkChatAuthInputShape,
        ...shape
      })
    )
  );

/** 资源直接访问或三种会话上下文；错误的显式鉴权数据不会降级为直接访问。 */
export const createOptionalOutLinkChatTargetInputSchema = <T extends z.ZodRawShape>(shape: T) =>
  z.union([createNoChatTargetSchema(shape), ...createOutLinkChatTargetInputSchema(shape).options]);

/** 会话上下文和分页方式分别选择；每个鉴权分支复用公共分页校验和 offset 优先规则。 */
export const createPaginatedChatTargetInputSchema = <T extends z.ZodRawShape>(shape: T) => {
  const [app, skill, outLink] = createOutLinkChatTargetInputSchema(shape).options;
  return z.union([
    createPaginationSchema(app.shape).meta(app.meta() ?? {}),
    createPaginationSchema(skill.shape).meta(skill.meta() ?? {}),
    createPaginationSchema(outLink.shape).meta(outLink.meta() ?? {})
  ]);
};

/**
 * OpenAPI query parameters 只能平铺，zod-openapi 不支持直接注册对象 union。
 * 仅为文档投影各分支字段及必填组合；API 入参校验继续使用原始 union。
 */
export const createChatTargetQueryDocumentSchema = <
  T extends readonly z.ZodObject<Record<string, z.ZodType>>[]
>(
  schema: z.ZodUnion<T>
) => {
  const branches = schema.options;
  const shape: Record<string, z.ZodType> = {};
  const isDisabled = (field: z.core.$ZodType): boolean =>
    field instanceof z.ZodNever ||
    ((field instanceof z.ZodOptional || field instanceof z.ZodCatch) && isDisabled(field.unwrap()));

  for (const branch of branches) {
    for (const [key, field] of Object.entries(branch.shape)) {
      if (key in shape || isDisabled(field)) continue;
      const requiredInAll = branches.every(
        (option) => option.shape[key] && !option.shape[key].safeParse(undefined).success
      );
      shape[key] = requiredInAll ? field : field.optional();
    }
  }
  return z.object(shape).meta({
    anyOf: branches.map((branch) => ({
      title: branch.meta()?.title,
      required: Object.entries(branch.shape)
        .filter(([, field]) => !field.safeParse(undefined).success)
        .map(([key]) => key)
    }))
  });
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
