import { ChatCompletionRequestMessage } from '@fastgpt/global/core/ai/type.d';

export type CreateQuestionGuideParams = {
  messages: ChatCompletionRequestMessage[];
  shareId?: string;
};
