import openai from 'openai';
import type {
  ChatCompletion as SdkChatCompletion,
  ChatCompletionMessageToolCall,
  ChatCompletionMessageParam as SdkChatCompletionMessageParam,
  ChatCompletionToolMessageParam,
  ChatCompletionContentPart as SdkChatCompletionContentPart,
  ChatCompletionUserMessageParam as SdkChatCompletionUserMessageParam,
  ChatCompletionToolMessageParam as SdkChatCompletionToolMessageParam,
  ChatCompletionAssistantMessageParam as SdkChatCompletionAssistantMessageParam,
  ChatCompletionTool
} from 'openai/resources';
import { ChatMessageTypeEnum } from './constants';
import type { WorkflowInteractiveResponseType } from '../workflow/template/system/interactive/type';
import type { Stream } from 'openai/streaming';
export * from 'openai/resources';

// Extension of ChatCompletionMessageParam, Add file url type
export type ChatCompletionContentPartFile = {
  type: 'file_url';
  name: string;
  url: string;
  key?: string;
};
// Rewrite ChatCompletionContentPart, Add file type
export type ChatCompletionContentPart =
  | (SdkChatCompletionContentPart & { key?: string })
  | ChatCompletionContentPartFile;
type CustomChatCompletionUserMessageParam = Omit<ChatCompletionUserMessageParam, 'content'> & {
  role: 'user';
  content: string | Array<ChatCompletionContentPart>;
};
type CustomChatCompletionToolMessageParam = SdkChatCompletionToolMessageParam & {
  role: 'tool';
  name?: string;
};
type CustomChatCompletionAssistantMessageParam = SdkChatCompletionAssistantMessageParam & {
  role: 'assistant';
  interactive?: WorkflowInteractiveResponseType;
};

export type ChatCompletionMessageParam = (
  | Exclude<
      SdkChatCompletionMessageParam,
      | SdkChatCompletionUserMessageParam
      | SdkChatCompletionToolMessageParam
      | SdkChatCompletionAssistantMessageParam
    >
  | CustomChatCompletionUserMessageParam
  | CustomChatCompletionToolMessageParam
  | CustomChatCompletionAssistantMessageParam
) & {
  reasoning_text?: string;
  dataId?: string;
  hideInUI?: boolean;
};
export type SdkChatCompletionMessageParam = SdkChatCompletionMessageParam;

/* ToolChoice and functionCall extension */
export type ChatCompletionToolMessageParam = ChatCompletionToolMessageParam & { name: string };
export type ChatCompletionAssistantToolParam = {
  role: 'assistant';
  tool_calls: ChatCompletionMessageToolCall[];
};

export type ChatCompletionMessageFunctionCall =
  SdkChatCompletionAssistantMessageParam.FunctionCall & {
    id?: string;
    toolName?: string;
    toolAvatar?: string;
  };

// Stream response
export type StreamChatType = Stream<openai.Chat.Completions.ChatCompletionChunk & { error?: any }>;
export type UnStreamChatType = openai.Chat.Completions.ChatCompletion;

// UnStream response
export type ChatCompletion = SdkChatCompletion & {
  error?: any;
};

export type CompletionFinishReason =
  | 'error'
  | 'close'
  | 'stop'
  | 'length'
  | 'tool_calls'
  | 'content_filter'
  | 'function_call'
  | null
  | undefined;

export default openai;
export * from 'openai';
export type { Stream };

// Other
export type PromptTemplateItem = {
  title: string;
  desc: string;
  value: Record<string, string>;
};
