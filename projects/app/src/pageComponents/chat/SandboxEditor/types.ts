import type Editor from '@monaco-editor/react';
import type { ChatTargetInputType } from '@fastgpt/global/openapi/core/chat/api';
import { getChatSourceKey, toChatSourceTarget } from '@/web/core/chat/utils';

export type SandboxEditorInstance = Parameters<
  NonNullable<Parameters<typeof Editor>[0]['onMount']>
>[0];

export type SandboxTargetInput = {
  appId?: string;
  chatTarget?: ChatTargetInputType;
};

const normalizeSandboxChatTarget = (chatTarget?: ChatTargetInputType) => {
  if (!chatTarget) return;

  if ('skillId' in chatTarget && chatTarget.skillId) {
    return { skillId: chatTarget.skillId };
  }

  if ('appId' in chatTarget && chatTarget.appId) {
    return { appId: chatTarget.appId };
  }
};

/**
 * 规范化 SandboxEditor 的业务目标。
 *
 * App 调用方可继续只传真实 appId；Skill Edit 必须传 chatTarget.skillId，避免 UI/API
 * 链路继续把 skillId 当作 appId 使用。
 */
export function resolveSandboxTarget({
  appId,
  chatTarget
}: SandboxTargetInput): ChatTargetInputType {
  const normalizedChatTarget = normalizeSandboxChatTarget(chatTarget);
  if (normalizedChatTarget) {
    return normalizedChatTarget;
  }

  if (appId) {
    return { appId };
  }

  throw new Error('Sandbox target is required');
}

/** 尝试解析 Sandbox 目标；分享页首屏可能尚未拿到真实 appId，此时保持空态等待后续刷新。 */
export function tryResolveSandboxTarget(
  props: SandboxTargetInput
): ChatTargetInputType | undefined {
  const { appId, chatTarget } = props;
  const normalizedChatTarget = normalizeSandboxChatTarget(chatTarget);

  if (normalizedChatTarget) {
    return normalizedChatTarget;
  }

  if (appId) {
    return { appId };
  }

  return undefined;
}

export const getSandboxTargetId = (target: ChatTargetInputType) =>
  getChatSourceKey(toChatSourceTarget(target));
