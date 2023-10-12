import { ChatCompletionRequestMessage } from '@fastgpt/core/ai/type';

export type CreateQuestionGuideParams = {
  messages: ChatCompletionRequestMessage[];
  shareId?: string;
};
