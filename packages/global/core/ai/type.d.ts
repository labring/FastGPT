import openai from 'openai';
import type {
  ChatCompletion,
  ChatCompletionMessageToolCall,
  ChatCompletionCreateParams,
  ChatCompletionChunk,
  ChatCompletionMessageParam,
  ChatCompletionToolMessageParam,
  ChatCompletionContentPart
} from 'openai/resources';

export type ChatCompletionContentPart = ChatCompletionContentPart;
export type ChatCompletionCreateParams = ChatCompletionCreateParams;
export type ChatCompletionMessageParam = ChatCompletionMessageParam & {
  dataId?: string;
  content: any;
};
export type ChatCompletionToolMessageParam = ChatCompletionToolMessageParam & { name: string };
export type ChatCompletionAssistantToolParam = {
  role: 'assistant';
  tool_calls: ChatCompletionMessageToolCall[];
};

export type ChatCompletion = ChatCompletion;
export type ChatCompletionMessageToolCall = ChatCompletionMessageToolCall;
export type StreamChatType = Stream<ChatCompletionChunk>;

export type PromptTemplateItem = {
  title: string;
  desc: string;
  value: string;
};

export default openai;
export * from 'openai';
