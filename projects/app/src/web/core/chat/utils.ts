import type { ChatTargetInputType } from '@fastgpt/global/openapi/core/chat/api';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { isAuxiliaryGenerationSourceType } from '@fastgpt/global/common/chat/source';
import { useMemo } from 'react';
import type { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';
import type { OptionalChatAuthTargetInput, ResolvedChatAuthTargetInput } from './type';

type OptionalChatTargetInput = Partial<Record<'appId' | 'skillId', string>> & {
  sourceType?:
    | ChatSourceTypeEnum.app
    | ChatSourceTypeEnum.chatAgentHelper
    | ChatSourceTypeEnum.workflowBuilder;
};
type OptionalChatSourceInput = {
  sourceType?: ChatSourceTypeEnum;
  sourceId?: string;
};
type ChatAuthQueryInputSource = Partial<Record<'appId' | 'skillId', string>> &
  OptionalChatSourceInput & {
    outLinkAuthData?: OutLinkChatAuthProps;
  };
export type ChatAuthTargetInput = OptionalChatTargetInput & {
  outLinkAuthData?: OutLinkChatAuthProps;
};
export type ChatAuthQueryTargetInput = OptionalChatTargetInput & {
  outLinkAuthData?: string;
};

export type ChatSourceTarget = {
  sourceType:
    | ChatSourceTypeEnum.app
    | ChatSourceTypeEnum.skillEdit
    | ChatSourceTypeEnum.chatAgentHelper
    | ChatSourceTypeEnum.workflowBuilder;
  sourceId: string;
};

/**
 * 将 OpenAPI raw target 转换为前端内部标准 source target。
 *
 * 仅用于 SandboxEditor 等 API 边界 raw target 需要生成内部 source key 的场景；
 * ChatBox 和 WorkflowRuntimeContext 必须直接接收 `ChatSourceTarget`。
 */
export const toChatSourceTarget = (target: ChatTargetInputType): ChatSourceTarget => {
  if ('skillId' in target && target.skillId) {
    return {
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId: target.skillId
    };
  }

  return {
    sourceType: isAuxiliaryGenerationSourceType(target.sourceType)
      ? target.sourceType
      : ChatSourceTypeEnum.app,
    sourceId: target.appId!
  };
};

/**
 * 将前端内部 source target 转换为 OpenAPI raw target。
 *
 * 所有标准 chat 请求仍按对外协议传 `appId/skillId`，由 API route 的 runtime schema
 * 负责转换为服务端 `sourceType/sourceId`。
 */
export const toChatApiTarget = (target: ChatSourceTarget): ChatTargetInputType => {
  if (target.sourceType === ChatSourceTypeEnum.skillEdit) {
    return { skillId: target.sourceId };
  }
  if (isAuxiliaryGenerationSourceType(target.sourceType)) {
    return { appId: target.sourceId, sourceType: target.sourceType };
  }

  return { appId: target.sourceId };
};

/**
 * 将内部 source target 转成带鉴权上下文的 OpenAPI raw target。
 *
 * share 模式的 schema 要求只传 `outLinkAuthData`，真实 App 由 API 鉴权解析；
 * 普通 App/Skill 调用继续传 `appId/skillId`。
 */
export const toChatAuthApiTarget = ({
  sourceTarget,
  outLinkAuthData
}: {
  sourceTarget: ChatSourceTarget;
  outLinkAuthData?: OutLinkChatAuthProps;
}): ResolvedChatAuthTargetInput => {
  const hasShareAuth = !!(outLinkAuthData?.shareId && outLinkAuthData.outLinkUid);

  if (hasShareAuth) {
    return { outLinkAuthData };
  }

  return toChatApiTarget(sourceTarget);
};

/**
 * 从已是 OpenAPI raw 格式的对象中提取 chat 鉴权 target。
 *
 * 引用详情、原文件读取等 metadata 会把数据集 sourceId/sourceName 一起携带；
 * 这里只保留 chat 鉴权字段，避免和数据集来源字段混用。
 */
export function getChatAuthTargetInput(
  target: ResolvedChatAuthTargetInput
): ResolvedChatAuthTargetInput;
export function getChatAuthTargetInput(target: ChatAuthTargetInput): OptionalChatAuthTargetInput;
export function getChatAuthTargetInput(target: ChatAuthTargetInput): OptionalChatAuthTargetInput {
  const outLinkAuthData = target.outLinkAuthData;
  if (outLinkAuthData?.shareId && outLinkAuthData.outLinkUid) {
    return { outLinkAuthData };
  }

  if (target.skillId) {
    return { skillId: target.skillId };
  }

  if (target.appId) {
    return isAuxiliaryGenerationSourceType(target.sourceType)
      ? { appId: target.appId, sourceType: target.sourceType }
      : { appId: target.appId };
  }

  return {};
}

/**
 * 将 chat 鉴权 target 转成 query 传输形态。
 *
 * GET/DELETE query 无法稳定保留嵌套对象，share 模式在 chat API 层统一序列化；
 * API 边界的 zod schema 会再解析回对象，业务层仍只接收对象。
 */
export const toChatAuthQueryTarget = (target: ChatAuthTargetInput): ChatAuthQueryTargetInput => {
  const chatAuthTarget = getChatAuthTargetInput(target);
  const outLinkAuthData = chatAuthTarget.outLinkAuthData;

  if (outLinkAuthData?.shareId && outLinkAuthData.outLinkUid) {
    return {
      outLinkAuthData: JSON.stringify(outLinkAuthData)
    };
  }

  if (chatAuthTarget.skillId) {
    return { skillId: chatAuthTarget.skillId };
  }

  if (chatAuthTarget.appId) {
    return isAuxiliaryGenerationSourceType(chatAuthTarget.sourceType)
      ? { appId: chatAuthTarget.appId, sourceType: chatAuthTarget.sourceType }
      : { appId: chatAuthTarget.appId };
  }

  return {};
};

/** 保留 chat API 其它 query 字段，只把鉴权 target 转成 query 传输形态。 */
export const toChatAuthQueryInput = <T extends ChatAuthQueryInputSource>(
  data: T
): Omit<T, 'appId' | 'skillId' | 'sourceType' | 'outLinkAuthData'> & ChatAuthQueryTargetInput => {
  const { appId, skillId, sourceType, outLinkAuthData, ...rest } = data;

  return {
    ...rest,
    ...(!appId && !skillId && sourceType ? { sourceType } : {}),
    ...toChatAuthQueryTarget({
      appId,
      skillId,
      sourceType: isAuxiliaryGenerationSourceType(sourceType) ? sourceType : undefined,
      outLinkAuthData
    })
  };
};

/** 在组件内把标准 source target 转为 OpenAPI raw target，避免各请求点重复拼 appId/skillId。 */
export const useChatApiTarget = (target: ChatSourceTarget): ChatTargetInputType =>
  useMemo(() => toChatApiTarget(target), [target]);

/** 在组件内把标准 source target 转为带分享鉴权语义的 OpenAPI raw target。 */
export const useChatAuthApiTarget = ({
  sourceTarget,
  outLinkAuthData
}: {
  sourceTarget: ChatSourceTarget;
  outLinkAuthData?: OutLinkChatAuthProps;
}): ResolvedChatAuthTargetInput =>
  useMemo(
    () => toChatAuthApiTarget({ sourceTarget, outLinkAuthData }),
    [sourceTarget, outLinkAuthData]
  );

/** 返回前端运行时状态隔离 key，避免 App 与 Skill Edit 只按裸 id 混用。 */
export const getChatSourceKey = (target?: ChatSourceTarget | null) =>
  target ? `${target.sourceType}:${target.sourceId}` : '';

/** App Chat 的前端运行时状态隔离 key。 */
export const getAppChatSourceKey = (appId?: string) =>
  appId ? getChatSourceKey({ sourceType: ChatSourceTypeEnum.app, sourceId: appId }) : '';

/** Skill Edit Chat 的前端运行时状态隔离 key。 */
export const getSkillEditChatSourceKey = (skillId?: string) =>
  skillId ? getChatSourceKey({ sourceType: ChatSourceTypeEnum.skillEdit, sourceId: skillId }) : '';

/**
 * 规范化前端标准 chat API 的 raw target 入参。
 *
 * 前端请求层仍按 OpenAPI 暴露 `appId/skillId`，由 API route 的 zod transform
 * 转成 `sourceType/sourceId`；业务组件不要自己拼内部字段。
 */
export const getChatTargetInput = (target: ChatTargetInputType): ChatTargetInputType => {
  if ('skillId' in target && target.skillId) {
    return { skillId: target.skillId };
  }

  return isAuxiliaryGenerationSourceType(target.sourceType)
    ? { appId: target.appId!, sourceType: target.sourceType }
    : { appId: target.appId! };
};

export const hasChatTargetInput = (target?: { appId?: unknown; skillId?: unknown } | null) =>
  typeof target?.appId === 'string' || typeof target?.skillId === 'string';

/** 判断 raw 请求是否只有一种完整会话上下文，避免把全可选字段误当成已确定的 union 分支。 */
export const hasChatAuthTargetInput = (
  target?:
    | ({
        outLinkAuthData?: unknown;
      } & {
        appId?: unknown;
        skillId?: unknown;
        sourceType?: unknown;
      })
    | null
): target is ResolvedChatAuthTargetInput => {
  if (!target) return false;
  const { appId, skillId, sourceType, outLinkAuthData } = target;
  if (outLinkAuthData !== undefined) {
    return !!(
      outLinkAuthData &&
      typeof outLinkAuthData === 'object' &&
      'shareId' in outLinkAuthData &&
      typeof outLinkAuthData.shareId === 'string' &&
      'outLinkUid' in outLinkAuthData &&
      typeof outLinkAuthData.outLinkUid === 'string' &&
      outLinkAuthData.shareId &&
      outLinkAuthData.outLinkUid &&
      appId === undefined &&
      skillId === undefined &&
      sourceType === undefined
    );
  }
  if (typeof appId === 'string') {
    return (
      skillId === undefined &&
      (sourceType === undefined ||
        sourceType === ChatSourceTypeEnum.app ||
        isAuxiliaryGenerationSourceType(sourceType))
    );
  }
  return typeof skillId === 'string' && appId === undefined && sourceType === undefined;
};

export const getAppIdFromChatTarget = (target: ChatTargetInputType) =>
  'appId' in target ? target.appId : undefined;
