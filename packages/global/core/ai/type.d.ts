import type {
  ChatCompletion,
  ChatCompletionCreateParams,
  ChatCompletionChunk,
  ChatCompletionMessageParam,
  ChatCompletionContentPart
} from 'openai/resources';

export type ChatCompletionContentPart = ChatCompletionContentPart;
export type ChatCompletionCreateParams = ChatCompletionCreateParams;
export type ChatMessageItemType = Omit<ChatCompletionMessageParam, 'name'> & {
  name?: any;
  dataId?: string;
  content: any;
} & any;

export type ChatCompletion = ChatCompletion;
export type StreamChatType = Stream<ChatCompletionChunk>;

export type PromptTemplateItem = {
  title: string;
  desc: string;
  value: string;
};
