import openai from 'openai';
import type {
  ChatCompletionMessageToolCall,
  ChatCompletionChunk,
  ChatCompletionMessageParam as SdkChatCompletionMessageParam,
  ChatCompletionToolMessageParam,
  ChatCompletionAssistantMessageParam,
  ChatCompletionContentPart as SdkChatCompletionContentPart,
  ChatCompletionUserMessageParam as SdkChatCompletionUserMessageParam
} from 'openai/resources';
import { ChatMessageTypeEnum } from './constants';
import { InteractiveNodeResponseItemType } from '../workflow/template/system/interactive/type';
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
type CustomChatCompletionUserMessageParam = {
  content: string | Array<ChatCompletionContentPart>;
  role: 'user';
  name?: string;
};

export type ChatCompletionMessageParam = (
  | Exclude<SdkChatCompletionMessageParam, SdkChatCompletionUserMessageParam>
  | CustomChatCompletionUserMessageParam
) & {
  dataId?: string;
  interactive?: InteractiveNodeResponseItemType;
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
export type ChatCompletionMessageFunctionCall = ChatCompletionAssistantMessageParam.FunctionCall & {
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
