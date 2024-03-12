import { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/type.d';
import type { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat.d';

export type CreateQuestionGuideParams = OutLinkChatAuthProps & {
  messages: ChatCompletionMessageParam[];
};
