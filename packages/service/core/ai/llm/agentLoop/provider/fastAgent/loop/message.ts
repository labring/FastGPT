import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/llm/type';

/**
 * 过滤空 assistant 消息。
 * OpenAI tool-call 协议允许 assistant 只有 tool_calls、没有 content；这些消息不应作为可见 AI 回复保存。
 */
export const filterEmptyAssistantMessages = (messages: ChatCompletionMessageParam[]) => {
  return messages.filter((item) => {
    if (item.role === 'assistant') {
      if (!item.content) return false;
      if (item.content.length === 0) return false;
    }
    return true;
  });
};
