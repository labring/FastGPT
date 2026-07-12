import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/llm/type';

const getAssistantText = (message: ChatCompletionMessageParam) => {
  if (message.role !== 'assistant' || !message.content) return '';
  if (message.tool_calls?.length) return '';
  if (typeof message.content === 'string') return message.content;

  return message.content.map((item) => (item.type === 'text' ? item.text : '')).join('');
};

const getAssistantReasoning = (message: ChatCompletionMessageParam) => {
  if (message.role !== 'assistant' || !message.reasoning_content) return '';
  if (message.tool_calls?.length) return '';

  return message.reasoning_content;
};

/**
 * 从本轮 assistant transcript 中提取最终可见文本和 reasoning。
 * 带 tool_calls 的 assistant 轮次只是工具选择过程，内容已经通过事件流展示，不并入最终回答。
 */
export const getAgentLoopCoreFinalMessageText = (messages: ChatCompletionMessageParam[]) =>
  messages.map(getAssistantText).join('');

/**
 * 从本轮 assistant transcript 中提取最终 reasoning。
 * 边界与最终回答一致：工具选择轮的 reasoning 属于中间过程，不写入最终 reasoning summary。
 */
export const getAgentLoopCoreFinalMessageReasoning = (messages: ChatCompletionMessageParam[]) =>
  messages.map(getAssistantReasoning).join('');
