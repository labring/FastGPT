import type { AIChatItemValueItemType } from '@fastgpt/global/core/chat/helperBot/type';

export const formatAIResponse = ({
  text,
  reasoning
}: {
  text: string;
  reasoning?: string;
}): AIChatItemValueItemType[] => {
  const result: AIChatItemValueItemType[] = [];

  if (reasoning) {
    result.push({
      reasoning: {
        content: reasoning
      }
    });
  }

  result.push({
    text: {
      content: text
    }
  });

  return result;
};
