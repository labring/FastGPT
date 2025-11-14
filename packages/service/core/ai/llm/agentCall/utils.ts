import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/type';

export const filterEmptyAssistantMessages = (messages: ChatCompletionMessageParam[]) => {
  return messages.filter((item) => {
    if (item.role === 'assistant') {
      if (!item.content) return false;
      if (item.content.length === 0) return false;
    }
    return true;
  });
};
