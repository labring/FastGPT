import openai from 'openai';
import type {
  ChatCompletionMessageToolCall,
  ChatCompletionChunk,
  ChatCompletionMessageParam,
  ChatCompletionToolMessageParam,
  ChatCompletionAssistantMessageParam
} from 'openai/resources';
import { ChatMessageTypeEnum } from './constants';

export * from 'openai/resources';

export type ChatCompletionMessageParam = ChatCompletionMessageParam & {
  dataId?: string;
};
export type ChatCompletionToolMessageParam = ChatCompletionToolMessageParam & { name: string };
export type ChatCompletionAssistantToolParam = {
  role: 'assistant';
  tool_calls: ChatCompletionMessageToolCall[];
};

export type ChatCompletionMessageToolCall = ChatCompletionMessageToolCall & {
  toolName?: string;
  toolAvatar?: string;
};
export type ChatCompletionMessageFunctionCall = ChatCompletionAssistantMessageParam.FunctionCall & {
  id?: string;
  toolName?: string;
  toolAvatar?: string;
};
export type StreamChatType = Stream<ChatCompletionChunk>;

export type PromptTemplateItem = {
  title: string;
  desc: string;
  value: string;
};

export default openai;
export * from 'openai';
