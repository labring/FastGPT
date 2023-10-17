import OpenAI from 'openai';
export type ChatCompletionRequestMessage = OpenAI.Chat.CreateChatCompletionRequestMessage;
export type ChatCompletion = OpenAI.Chat.ChatCompletion;
export type CreateChatCompletionRequest = OpenAI.Chat.ChatCompletionCreateParams;

export type StreamChatType = Stream<OpenAI.Chat.ChatCompletionChunk>;

export type PromptTemplateItem = {
  title: string;
  desc: string;
  value: string;
};
