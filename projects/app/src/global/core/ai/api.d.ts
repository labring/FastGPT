import { ChatMessageItemType } from '@fastgpt/global/core/ai/type.d';

export type CreateQuestionGuideParams = {
  messages: ChatMessageItemType[];
  shareId?: string;
};
