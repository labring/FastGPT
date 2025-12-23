import type { AIChatItemValueItemType } from '@fastgpt/global/core/chat/helperBot/type';
import type { UserInputInteractive } from '@fastgpt/global/core/workflow/template/system/interactive/type';

export const formatAIResponse = ({
  text,
  reasoning,
  collectionForm
}: {
  text: string;
  reasoning?: string;
  collectionForm?: UserInputInteractive;
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

  if (collectionForm) {
    result.push({
      collectionForm
    });
  }

  return result;
};
