import type {
  ChatCompletionCreateParams,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming,
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ChatCompletionTool,
  CompletionFinishReason,
  CompletionUsage,
  OpenAI,
  StreamResponseType,
  UnStreamResponseType
} from '@fastgpt/global/core/ai/llm/type';
import type { LLMModelItemType } from '@fastgpt/global/core/ai/model.schema';
import type { OpenaiAccountType } from '@fastgpt/global/support/user/team/type';
import type { AIApiRequestMeta } from '../../config';
import type { ToolCallEventType } from '../toolCall/type';

export type ResponseEvents = ToolCallEventType & {
  // 普通回答文本增量。非 stream 响应也会在解析完成后触发一次，保持上层处理一致。
  onStreaming?: (e: { text: string }) => void;
  // reasoning 增量，来源可能是 reasoning_content，也可能是 <think> 标签解析结果。
  onReasoning?: (e: { text: string }) => void;
};

// 根据 stream 字段把请求体收窄到 SDK 对应类型，避免调用 create 时丢失 stream 类型信息。
export type InferCompletionsBody<T> = T extends { stream: true }
  ? ChatCompletionCreateParamsStreaming
  : T extends { stream: false }
    ? ChatCompletionCreateParamsNonStreaming
    : ChatCompletionCreateParams;

// tools 同步用 FastGPT narrow 后的 ChatCompletionTool（function-only），
// 避免 SDK 联合类型透过 T['tools'] 漏到下游。
export type LLMRequestBodyType<T> = Omit<
  T,
  'model' | 'stop' | 'response_format' | 'messages' | 'tools'
> & {
  model: string | LLMModelItemType;
  stop?: string;
  response_format?: {
    type?: string;
    json_schema?: string;
  };
  messages: ChatCompletionMessageParam[];
  tools?: ChatCompletionTool[];

  // Custom field
  retainDatasetCite?: boolean;
  toolCallMode?: 'toolChoice' | 'prompt';
  useVision?: boolean;
  useAudio?: boolean;
  useVideo?: boolean;
  extractFiles?: boolean;
  requestOrigin?: string;
};

export type CreateLLMResponseProps<
  T extends ChatCompletionCreateParams = ChatCompletionCreateParams
> = {
  throwError?: boolean;
  userKey?: OpenaiAccountType;
  body: LLMRequestBodyType<T>;
  // 上层中断时返回 true。底层会 abort stream 并用 finish_reason=close 表达正常关闭。
  isAborted?: () => boolean | undefined | null;
  custonHeaders?: Record<string, string>;
  // finish_reason=length 时最多连续请求的次数，避免模型一直返回 length 造成死循环。
  maxContinuations?: number;
} & ResponseEvents;

export type LLMResponse = {
  requestId: string;
  error?: any;
  isStreamResponse: boolean;
  answerText: string;
  reasoningText: string;
  toolCalls?: ChatCompletionMessageToolCall[];
  finish_reason: CompletionFinishReason;
  responseEmptyTip?: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    // 只给上层计费判断使用，不保存到 LLM request detail。
    usedUserOpenAIKey: boolean;
  };

  // 原始请求 messages 与最终 assistantMessage，供上层继续拼完整对话上下文。
  requestMessages: ChatCompletionMessageParam[];
  assistantMessage?: ChatCompletionMessageParam;
  completeMessages: ChatCompletionMessageParam[];
};

// stream 与非 stream parser 都返回这个中间结构，再由 createLLMResponse 聚合 token、finish reason 和详情。
export type CompleteParams = Pick<CreateLLMResponseProps<ChatCompletionCreateParams>, 'body'> &
  ResponseEvents;

export type CompleteResponse = Pick<
  LLMResponse,
  'answerText' | 'reasoningText' | 'toolCalls' | 'finish_reason'
> & {
  usage?: CompletionUsage;
  error?: any;
};

export type LLMAccumulatedUsage = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cached_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
};

export type CreateChatCompletionProps = {
  modelData: LLMModelItemType;
  body: ChatCompletionCreateParamsNonStreaming | ChatCompletionCreateParamsStreaming;
  userKey?: OpenaiAccountType;
  timeout?: number;
  // 仅透传给 OpenAI SDK 的请求配置，业务字段不要放这里。
  options?: OpenAI.RequestOptions;
};

export type CreateChatCompletionResult =
  | {
      response: StreamResponseType;
      isStreamResponse: true;
      requestMeta: AIApiRequestMeta;
    }
  | {
      response: UnStreamResponseType;
      isStreamResponse: false;
      requestMeta: AIApiRequestMeta;
    };
