import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { type StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { getWebLLMModel } from '@/web/common/system/utils';
import type { ChatTargetInputType } from '@fastgpt/global/openapi/core/chat/api';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { useMemo } from 'react';
import type { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';

type OptionalChatTargetInput = Partial<Record<'appId' | 'skillId', string>>;
type OptionalChatSourceInput = {
  sourceType?: ChatSourceTypeEnum;
  sourceId?: string;
};
export type ChatAuthTargetInput = OptionalChatTargetInput & {
  outLinkAuthData?: OutLinkChatAuthProps;
};
export type ChatAuthQueryTargetInput = OptionalChatTargetInput & {
  outLinkAuthData?: string;
};

export type ChatSourceTarget = {
  sourceType: ChatSourceTypeEnum.app | ChatSourceTypeEnum.skillEdit;
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
    sourceType: ChatSourceTypeEnum.app,
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
}): ChatAuthTargetInput => {
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
export const getChatAuthTargetInput = (target: ChatAuthTargetInput): ChatAuthTargetInput => {
  const hasShareAuth = !!(target.outLinkAuthData?.shareId && target.outLinkAuthData.outLinkUid);

  if (hasShareAuth) {
    return { outLinkAuthData: target.outLinkAuthData };
  }

  if (target.skillId) {
    return { skillId: target.skillId };
  }

  if (target.appId) {
    return { appId: target.appId };
  }

  return {};
};

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
    return { appId: chatAuthTarget.appId };
  }

  return {};
};

/** 保留 chat API 其它 query 字段，只把鉴权 target 转成 query 传输形态。 */
export const toChatAuthQueryInput = <T extends ChatAuthTargetInput & OptionalChatSourceInput>(
  data: T
): Omit<T, 'appId' | 'skillId' | 'outLinkAuthData'> & ChatAuthQueryTargetInput => {
  const { appId, skillId, outLinkAuthData, ...rest } = data;

  return {
    ...rest,
    ...toChatAuthQueryTarget({ appId, skillId, outLinkAuthData })
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
}): ChatAuthTargetInput =>
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

  return { appId: target.appId! };
};

export const hasChatTargetInput = (target?: { appId?: unknown; skillId?: unknown } | null) =>
  typeof target?.appId === 'string' || typeof target?.skillId === 'string';

/** 判断请求是否包含可用于 chat 鉴权的 target，share 模式只传 outLinkAuthData。 */
export const hasChatAuthTargetInput = (
  target?:
    | ({
        outLinkAuthData?: unknown;
      } & {
        appId?: unknown;
        skillId?: unknown;
      })
    | null
) => {
  const outLinkAuthData =
    target?.outLinkAuthData && typeof target.outLinkAuthData === 'object'
      ? target.outLinkAuthData
      : undefined;

  return (
    hasChatTargetInput(target) ||
    !!(
      'shareId' in (outLinkAuthData ?? {}) &&
      (outLinkAuthData as OutLinkChatAuthProps).shareId &&
      'outLinkUid' in (outLinkAuthData ?? {}) &&
      (outLinkAuthData as OutLinkChatAuthProps).outLinkUid
    )
  );
};

export const getAppIdFromChatTarget = (target: ChatTargetInputType) =>
  'appId' in target ? target.appId : undefined;

export function checkChatSupportSelectFileByChatModels(models: string[] = []) {
  for (const model of models) {
    const modelData = getWebLLMModel(model);
    if (modelData?.vision) {
      return true;
    }
  }
  return false;
}

export function checkChatSupportSelectFileByModules(modules: StoreNodeItemType[] = []) {
  const chatModules = modules.filter(
    (item) =>
      item.flowNodeType === FlowNodeTypeEnum.chatNode ||
      item.flowNodeType === FlowNodeTypeEnum.toolCall
  );
  const models: string[] = chatModules.map(
    (item) => item.inputs.find((item) => item.key === 'model')?.value || ''
  );
  return checkChatSupportSelectFileByChatModels(models);
}

export function getAppQuestionGuidesByModules(modules: StoreNodeItemType[] = []) {
  const systemModule = modules.find((item) => item.flowNodeType === FlowNodeTypeEnum.systemConfig);
  const chatInputGuide = systemModule?.inputs.find(
    (item) => item.key === NodeInputKeyEnum.chatInputGuide
  )?.value;

  return chatInputGuide?.open ? chatInputGuide?.textList : [];
}

export function getAppQuestionGuidesByUserGuideModule(
  module: StoreNodeItemType,
  qGuideText: string[] = []
) {
  const chatInputGuide = module?.inputs.find(
    (item) => item.key === NodeInputKeyEnum.chatInputGuide
  )?.value;

  return chatInputGuide?.open ? qGuideText : [];
}
