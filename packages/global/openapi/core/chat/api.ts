import { ObjectIdSchema } from '../../../common/type/mongo';
import { ChatGenerateStatusEnum, ChatSourceTypeEnum } from '../../../core/chat/constants';
import { OutLinkChatAuthSchema } from '../../../support/permission/chat';
import z from 'zod';

export const ChatGenerateStatusSchema = z
  .enum(ChatGenerateStatusEnum)
  .describe('对话生成状态：0=generating（生成中），1=done（已完成），2=error（生成异常）');

const ChatTargetInputShape = {
  appId: ObjectIdSchema.optional().meta({
    example: '68ad85a7463006c963799a05',
    description: '应用 ID。appId 和 skillId 必须且只能传一个。'
  }),
  skillId: ObjectIdSchema.optional().meta({
    example: '68ad85a7463006c963799a06',
    description: 'Skill Edit 调试 ID。appId 和 skillId 必须且只能传一个。'
  })
};

type ChatTargetInput = {
  appId?: unknown;
  skillId?: unknown;
  [key: string]: unknown;
};

export type ChatTargetInputType =
  | {
      appId: string;
      skillId?: never;
    }
  | {
      appId?: never;
      skillId: string;
    };

export const refineRequiredChatTargetInput = (
  data: { appId?: unknown; skillId?: unknown },
  ctx: z.RefinementCtx
) => {
  if (!!data.appId === !!data.skillId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'appId or skillId must be provided, but not both'
    });
  }
};

export const refineOptionalChatTargetInput = (
  data: { appId?: unknown; skillId?: unknown },
  ctx: z.RefinementCtx
) => {
  if (data.appId && data.skillId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'appId and skillId cannot be provided at the same time'
    });
  }
};

/**
 * 将对外 API 的 `appId/skillId` 互斥入参转换为内部标准 chat source。
 *
 * 该函数只用于 runtime schema 的 `.transform(...)`，OpenAPI path 必须继续注册
 * raw schema，避免文档暴露内部 `sourceType/sourceId`。
 */
export const transformChatTargetInput = <T extends ChatTargetInput>(data: T) => {
  const { appId, skillId, ...rest } = data;
  const sourceId = (appId || skillId) as string;

  return {
    ...rest,
    sourceType: appId ? ChatSourceTypeEnum.app : ChatSourceTypeEnum.skillEdit,
    sourceId
  };
};

/**
 * 可选 chat target 的转换函数。
 *
 * 仅用于外链、团队空间等允许从鉴权上下文推导 App 的接口；如果传入了 target，
 * 仍会转换为内部 `sourceType/sourceId`。
 */
export const transformOptionalChatTargetInput = <T extends ChatTargetInput>(data: T) => {
  const { appId, skillId, ...rest } = data;
  const sourceId = (appId || skillId) as string | undefined;

  return {
    ...rest,
    ...(appId || skillId
      ? {
          sourceType: appId ? ChatSourceTypeEnum.app : ChatSourceTypeEnum.skillEdit,
          sourceId: sourceId!
        }
      : {})
  };
};

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
 * 仅用于兼容外链/团队空间等可从鉴权上下文反推出 App 的接口；普通标准 chat API
 * 应继续使用 `createChatTargetInputSchema`，要求 appId/skillId 必填且互斥。
 */
export const createOptionalChatTargetInputSchema = <T extends z.ZodRawShape>(shape: T) =>
  z
    .object({
      ...ChatTargetInputShape,
      ...shape
    })
    .superRefine(refineOptionalChatTargetInput);

/**
 * 构造包含外链/团队鉴权字段的 chat target 入参 schema。
 *
 * 不能用 `OutLinkChatAuthSchema.extend(createChatTargetInputSchema(...).shape)` 拼接，
 * 否则会丢失 `createChatTargetInputSchema` 上 appId/skillId 互斥校验。
 */
export const createOutLinkChatTargetInputSchema = <T extends z.ZodRawShape>(shape: T) =>
  createChatTargetInputSchema({
    ...OutLinkChatAuthSchema.shape,
    ...shape
  });

/**
 * 构造允许缺省 chat target、且包含外链/团队鉴权字段的入参 schema。
 *
 * 仅用于外链、团队空间等允许从鉴权上下文推导 App 的接口。
 */
export const createOptionalOutLinkChatTargetInputSchema = <T extends z.ZodRawShape>(shape: T) =>
  createOptionalChatTargetInputSchema({
    ...OutLinkChatAuthSchema.shape,
    ...shape
  });

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
 * 不能使用该 helper，避免绕过 appId/skillId 互斥校验。
 */
export const withOptionalChatTarget = <T extends z.ZodRawShape>(shape: T) =>
  createOptionalChatTargetInputSchema(shape).transform(transformOptionalChatTargetInput);

/** 包含外链/团队鉴权字段的必填 chat target runtime schema helper。 */
export const withOutLinkChatTarget = <T extends z.ZodRawShape>(shape: T) =>
  createOutLinkChatTargetInputSchema(shape).transform(transformChatTargetInput);

/** 包含外链/团队鉴权字段的可选 chat target runtime schema helper。 */
export const withOptionalOutLinkChatTarget = <T extends z.ZodRawShape>(shape: T) =>
  createOptionalOutLinkChatTargetInputSchema(shape).transform(transformOptionalChatTargetInput);

/* Recently Used Apps */
export const GetRecentlyUsedAppsResponseSchema = z.array(
  z.object({
    appId: ObjectIdSchema.describe('应用ID'),
    name: z.string().min(1).describe('应用名称'),
    avatar: z.string().min(1).describe('应用头像')
  })
);
export type GetRecentlyUsedAppsResponseType = z.infer<typeof GetRecentlyUsedAppsResponseSchema>;
