import { ChatCompletionRequestMessage } from '@fastgpt/core/ai/type';

export type CreateQuestionGuideProps = {
  messages: ChatCompletionRequestMessage[];
  shareId?: string;
};
