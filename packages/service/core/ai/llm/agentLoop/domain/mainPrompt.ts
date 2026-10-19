import { SANDBOX_SYSTEM_PROMPT } from '@fastgpt/global/core/ai/sandbox/constants';

const DEFAULT_AGENT_SYSTEM_PROMPT = `你是一个 Work Agent。

根据用户目标和当前上下文完成任务。
需要执行动作时，调用当前提供的工具；不要调用不存在的工具。
工具返回结果后，根据结果继续执行或给出最终回答。
`;

export type BuildDefaultAgentSystemPromptParams = {
  systemPromptExtension?: string;
  userSystemPrompt?: string;
  sandboxEnabled?: boolean;
};

/**
 * 构建 Agent 的最终 system prompt。
 *
 * AgentLoop provider 只消费该方法返回的最终文本；沙盒能力和平台扩展作为默认区块注入，
 * userSystemPrompt 区块只保留用户配置。
 */
export const buildDefaultAgentSystemPrompt = ({
  systemPromptExtension,
  userSystemPrompt,
  sandboxEnabled = false
}: BuildDefaultAgentSystemPromptParams = {}) =>
  [
    DEFAULT_AGENT_SYSTEM_PROMPT.trim(),
    sandboxEnabled ? SANDBOX_SYSTEM_PROMPT.trim() : undefined,
    systemPromptExtension?.trim() || undefined,
    userSystemPrompt?.trim()
      ? `<user_system_prompt>\n${userSystemPrompt.trim()}\n</user_system_prompt>`
      : undefined
  ]
    .filter(Boolean)
    .join('\n\n');
