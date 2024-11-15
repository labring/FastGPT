import openai from 'openai';
import type {
  ChatCompletionMessageToolCall,
  ChatCompletionChunk,
  ChatCompletionMessageParam as SdkChatCompletionMessageParam,
  ChatCompletionToolMessageParam,
  ChatCompletionContentPart as SdkChatCompletionContentPart,
  ChatCompletionUserMessageParam as SdkChatCompletionUserMessageParam,
  ChatCompletionToolMessageParam as SdkChatCompletionToolMessageParam,
  ChatCompletionAssistantMessageParam as SdkChatCompletionAssistantMessageParam,
  ChatCompletionContentPartText
} from 'openai/resources';
import { ChatMessageTypeEnum } from './constants';
import { WorkflowInteractiveResponseType } from '../workflow/template/system/interactive/type';
export * from 'openai/resources';

// Extension of ChatCompletionMessageParam, Add file url type
export type ChatCompletionContentPartFile = {
  type: 'file_url';
  name: string;
  url: string;
};
// Rewrite ChatCompletionContentPart, Add file type
export type ChatCompletionContentPart =
  | SdkChatCompletionContentPart
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
export type ChatCompletionMessageToolCall = ChatCompletionMessageToolCall & {
  toolName?: string;
  toolAvatar?: string;
};
export type ChatCompletionMessageFunctionCall =
  SdkChatCompletionAssistantMessageParam.FunctionCall & {
    id?: string;
    toolName?: string;
    toolAvatar?: string;
  };

// Stream response
export type StreamChatType = Stream<ChatCompletionChunk>;

export default openai;
export * from 'openai';

// Other
export type PromptTemplateItem = {
  title: string;
  desc: string;
  value: string;
};
