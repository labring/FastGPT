import type { AIChatItemValueItemType } from '@fastgpt/global/core/chat/helperBot/type';
import type { UserInputInteractive } from '@fastgpt/global/core/workflow/template/system/interactive/type';

type PlanHintType = {
  planHint?: {
    type: 'generation';
  };
};

export const formatAIResponse = ({
  text,
  reasoning,
  collectionForm,
  planHint
}: {
  text: string;
  reasoning?: string;
  collectionForm?: UserInputInteractive;
  planHint?: PlanHintType['planHint'];
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

  if (planHint) {
    result.push({
      planHint
    });
  }

  return result;
};
