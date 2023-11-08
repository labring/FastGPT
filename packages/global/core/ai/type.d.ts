import type {
  ChatCompletion,
  ChatCompletionCreateParams,
  ChatCompletionChunk,
  ChatCompletionMessageParam,
  ChatCompletionContentPart
} from 'openai/resources';
export type ChatCompletionContentPart = ChatCompletionContentPart;
export type ChatCompletionCreateParams = ChatCompletionCreateParams;
export type ChatMessageItemType = Omit<ChatCompletionMessageParam> & {
  dataId?: string;
  content: any;
};

export type ChatCompletion = ChatCompletion;
export type StreamChatType = Stream<ChatCompletionChunk>;

export type PromptTemplateItem = {
  title: string;
  desc: string;
  value: string;
};
