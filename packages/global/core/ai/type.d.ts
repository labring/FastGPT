import type { ChatCompletion, ChatCompletion, ChatCompletionChunk } from 'openai/resources';
export type ChatCompletion = ChatCompletion;
export type ChatCompletionMessageParam = messageParams;

export type StreamChatType = Stream<ChatCompletionChunk>;

export type PromptTemplateItem = {
  title: string;
  desc: string;
  value: string;
};
