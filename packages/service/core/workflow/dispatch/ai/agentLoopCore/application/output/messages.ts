import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/llm/type';

const getAssistantText = (message: ChatCompletionMessageParam) => {
  if (message.role !== 'assistant' || !message.content) return '';
  if (typeof message.content === 'string') return message.content;

  return message.content.map((item) => (item.type === 'text' ? item.text : '')).join('');
};

const getAssistantReasoning = (message: ChatCompletionMessageParam) => {
  if (message.role !== 'assistant' || !message.reasoning_content) return '';

  return message.reasoning_content;
};

/**
 * 从本轮 assistant transcript 中提取全过程可见文本。
 * 与 ToolCall 节点的 getAgentLoopCorePersistedTextOutput 对齐，拼接整个 Agent 循环中所有轮次生成的文本。
 */
export const getAgentLoopCoreFinalMessageText = (messages: ChatCompletionMessageParam[]) =>
  messages.map(getAssistantText).join('');

/**
 * 从本轮 assistant transcript 中提取全过程 reasoning。
 */
export const getAgentLoopCoreFinalMessageReasoning = (messages: ChatCompletionMessageParam[]) =>
  messages.map(getAssistantReasoning).join('');
