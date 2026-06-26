import type Editor from '@monaco-editor/react';
import type { ChatTargetInputType } from '@fastgpt/global/openapi/core/chat/api';
import { getChatSourceKey, getChatTargetInput, toChatSourceTarget } from '@/web/core/chat/utils';

export type SandboxEditorInstance = Parameters<
  NonNullable<Parameters<typeof Editor>[0]['onMount']>
>[0];

export type SandboxTargetInput = {
  appId?: string;
  chatTarget?: ChatTargetInputType;
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
  if (chatTarget) {
    return getChatTargetInput(chatTarget);
  }

  if (appId) {
    return { appId };
  }

  throw new Error('Sandbox target is required');
}

export const getSandboxTargetId = (target: ChatTargetInputType) =>
  getChatSourceKey(toChatSourceTarget(target));
