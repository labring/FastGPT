import { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/type.d';

export type CreateQuestionGuideParams = {
  messages: ChatCompletionMessageParam[];
  shareId?: string;
};
