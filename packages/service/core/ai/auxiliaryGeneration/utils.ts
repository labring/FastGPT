import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';

export const createAnswerDelta = ({
  text,
  reasoningContent,
  model = '',
  finishReason = null
}: {
  text?: string | null;
  reasoningContent?: string | null;
  model?: string;
  finishReason?: null | 'stop';
}) => ({
  id: '',
  object: '',
  created: 0,
  model,
  choices: [
    {
      delta: {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: text,
        ...(reasoningContent ? { reasoning_content: reasoningContent } : {})
      },
      index: 0,
      finish_reason: finishReason
    }
  ]
});
