import { ObjectIdSchema } from '../../../common/type/mongo';
import { ChatGenerateStatusEnum, ChatSourceTypeEnum } from '../../../core/chat/constants';
import {
  OutLinkChatAuthSchema,
  parseOutLinkChatAuthInput,
  type OutLinkChatAuthProps
} from '../../../support/permission/chat';
import z from 'zod';

export const ChatGenerateStatusSchema = z
  .enum(ChatGenerateStatusEnum)
  .describe('对话生成状态：0=generating（生成中），1=done（已完成），2=error（生成异常）');

const ChatTargetInputShape = {
  appId: ObjectIdSchema.optional().meta({
    example: '68ad85a7463006c963799a05',
    description: '应用 ID。appId、skillId 和 outLinkAuthData 必须且只能传一个。'
  }),
  skillId: ObjectIdSchema.optional().meta({
    example: '68ad85a7463006c963799a06',
    description: 'Skill Edit 调试 ID。appId、skillId 和 outLinkAuthData 必须且只能传一个。'
  }),
  sourceType: z.enum([ChatSourceTypeEnum.app, ChatSourceTypeEnum.chatAgentHelper]).optional().meta({
    example: ChatSourceTypeEnum.chatAgentHelper,
    description:
      'appId 对应的会话资源类型。缺省为 App 会话；ChatAgentHelper 会话传 chatAgentHelper。'
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
    '外链鉴权数据。share 模式传 shareId/outLinkUid。'
  )
};

type RefineChatAuthTargetInputOptions = {
  required: boolean;
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

  const exhaustiveCheck: never = sourceType;
  throw new Error(`Unsupported chat source type: ${exhaustiveCheck}`);
};

/** 构造带 appId/skillId 互斥返回字段的 OpenAPI response schema。 */
export const createChatTargetResponseSchema = <T extends z.ZodRawShape>(shape: T) =>
  z.intersection(z.object(shape), ChatTargetResponseSchema);

export const refineRequiredChatTargetInput = (
  data: {
    appId?: unknown;
    skillId?: unknown;
    sourceType?: unknown;
    outLinkAuthData?: unknown;
  },
  ctx: z.RefinementCtx
) => {
  refineChatAuthTargetInput(data, ctx, { required: true });
};

export const refineOptionalChatTargetInput = (
  data: {
    appId?: unknown;
    skillId?: unknown;
    sourceType?: unknown;
    outLinkAuthData?: unknown;
  },
  ctx: z.RefinementCtx
) => {
  refineChatAuthTargetInput(data, ctx, { required: false });
};

/**
 * 校验 chat API 的资源 target 与授权上下文组合。
 *
 * `appId/skillId` 负责定位会话资源；share 模式通过 `outLinkAuthData` 传 `shareId/outLinkUid`，
 * 由后端鉴权解析真实 appId。
 */
const refineChatAuthTargetInput = (
  data: ChatTargetInput,
  ctx: z.RefinementCtx,
  { required }: RefineChatAuthTargetInputOptions
) => {
  const hasAppTarget = !!data.appId;
  const hasSkillTarget = !!data.skillId;
  const isChatAgentHelperTarget = data.sourceType === ChatSourceTypeEnum.chatAgentHelper;
  const nestedAuthData = getNestedOutLinkAuthData(data);
  const shareId = nestedAuthData.shareId;
  const outLinkUid = nestedAuthData.outLinkUid;
  const hasShareId = !!shareId;
  const hasOutLinkUid = !!outLinkUid;
  const hasShareAuth = hasShareId || hasOutLinkUid;
  const hasCompleteShareAuth = hasShareId && hasOutLinkUid;

  if (hasAppTarget && hasSkillTarget) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'appId and skillId cannot be provided at the same time'
    });
  }

  if ([hasAppTarget, hasSkillTarget, hasCompleteShareAuth].filter(Boolean).length > 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'appId, skillId and share auth cannot be provided at the same time'
    });
  }

  if (isChatAgentHelperTarget && !hasAppTarget) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'sourceType=chatAgentHelper requires appId'
    });
  }

  if (isChatAgentHelperTarget && hasSkillTarget) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'sourceType=chatAgentHelper cannot be used with skillId'
    });
  }

  if (hasShareAuth && !hasCompleteShareAuth) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'shareId and outLinkUid must be provided together'
    });
  }

  if (hasSkillTarget && hasShareAuth) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'skillId cannot be used with share auth'
    });
  }

  if (hasAppTarget && hasCompleteShareAuth) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'appId cannot be used with share auth'
    });
  }

  if (required && !hasAppTarget && !hasSkillTarget && !hasCompleteShareAuth) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'appId, skillId or share auth must be provided'
    });
  }
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
    sourceType: (() => {
      if (skillId) return ChatSourceTypeEnum.skillEdit;
      if (rawSourceType === ChatSourceTypeEnum.chatAgentHelper) {
        return ChatSourceTypeEnum.chatAgentHelper;
      }
      return ChatSourceTypeEnum.app;
    })(),
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
    sourceType: (() => {
      if (skillId) return ChatSourceTypeEnum.skillEdit;
      if (rawSourceType === ChatSourceTypeEnum.chatAgentHelper) {
        return ChatSourceTypeEnum.chatAgentHelper;
      }
      return ChatSourceTypeEnum.app;
    })(),
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
          sourceType: (() => {
            if (skillId) return ChatSourceTypeEnum.skillEdit;
            if (rawSourceType === ChatSourceTypeEnum.chatAgentHelper) {
              return ChatSourceTypeEnum.chatAgentHelper;
            }
            return ChatSourceTypeEnum.app;
          })(),
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
 * 构造对外 API 使用的 chat target 入参 schema。
 *
 * 该 schema 不包含 transform，专门用于 OpenAPI 文档和前端请求类型。
 * 运行时 API route 应使用 `withChatTarget`，在 `parseApiInput` 阶段转换为
 * `sourceType/sourceId`，避免 service 层继续感知 `appId/skillId` 原始字段。
 */
export const createChatTargetInputSchema = <T extends z.ZodRawShape>(shape: T) =>
  z
    .object({
      ...ChatTargetInputShape,
      ...shape
    })
    .superRefine(refineRequiredChatTargetInput);

/**
 * 构造允许缺省 chat target 的对外入参 schema。
 *
 * 仅用于兼容外链等可从鉴权上下文反推出 App 的接口；普通标准 chat API
 * 应继续使用 `createChatTargetInputSchema`，要求 target 必填且互斥。
 */
export const createOptionalChatTargetInputSchema = <T extends z.ZodRawShape>(shape: T) =>
  z
    .object({
      ...ChatTargetInputShape,
      ...shape
    })
    .superRefine(refineOptionalChatTargetInput);

/**
 * 构造包含外链鉴权字段的 chat target 入参 schema。
 *
 * 不能用 `OutLinkChatAuthSchema.extend(createChatTargetInputSchema(...).shape)` 拼接，
 * 否则会丢失 `createChatTargetInputSchema` 上 chat target 互斥校验。
 */
export const createOutLinkChatTargetInputSchema = <T extends z.ZodRawShape>(shape: T) =>
  z
    .object({
      ...ChatTargetInputShape,
      ...OutLinkChatAuthInputShape,
      ...shape
    })
    .superRefine(refineRequiredChatTargetInput);

/** 构造允许缺省 chat target、且包含外链鉴权字段的入参 schema。 */
export const createOptionalOutLinkChatTargetInputSchema = <T extends z.ZodRawShape>(shape: T) =>
  z
    .object({
      ...ChatTargetInputShape,
      ...OutLinkChatAuthInputShape,
      ...shape
    })
    .superRefine(refineOptionalChatTargetInput);

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
