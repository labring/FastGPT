import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { type StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { getWebLLMModel } from '@/web/common/system/utils';
import type { ChatTargetInputType } from '@fastgpt/global/openapi/core/chat/api';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { useMemo } from 'react';

type OptionalChatTargetInput = Partial<Record<'appId' | 'skillId', string>>;

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

/** 在组件内把标准 source target 转为 OpenAPI raw target，避免各请求点重复拼 appId/skillId。 */
export const useChatApiTarget = (target: ChatSourceTarget): ChatTargetInputType =>
  useMemo(() => toChatApiTarget(target), [target]);

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

export const hasChatTargetInput = (target?: OptionalChatTargetInput | null) =>
  !!target?.appId || !!target?.skillId;

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
