import type {
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming,
  ChatCompletionMessageToolCall,
  CompletionFinishReason,
  CompletionUsage,
  StreamChatType
} from './type';
import {
  parseLLMStreamResponse,
  parseReasoningContent,
  removeDatasetCiteText
} from '../../../service/core/ai/utils';
import { createChatCompletion } from '../../../service/core/ai/config';
import type { OpenaiAccountType } from 'support/user/team/type';

type BasicResponseParams = {
  abortSignal: boolean;
  reasoning: boolean;
  retainDatasetCite?: boolean;
};

type CreateLLMResponseProps<
  T extends ChatCompletionCreateParamsNonStreaming | ChatCompletionCreateParamsStreaming
> = {
  requestBody: T;
  params: BasicResponseParams;
  userKey?: OpenaiAccountType;
  events?: T extends ChatCompletionCreateParamsStreaming
    ? CreateStreamResponseEvents
    : CreateCompleteResopnseEvents;
};

type LLMResponse = {
  answerText: string;
  reasoningText: string;
  toolCallResults: ChatCompletionMessageToolCall[];
  finish_reason: CompletionFinishReason;
  getEmptyResponseTip: () => string;
  inputTokens?: number;
  outputTokens?: number;
};

type CreateStreamResponseParams = BasicResponseParams & {
  stream: StreamChatType;
};

type CreateCompleteResopnseParams = Omit<BasicResponseParams, 'res'> & {
  completion: ChatCompletion;
};

type CreateStreamResponseEvents = {
  onStreaming?: ({
    responseContent,
    originContent
  }: {
    responseContent: string;
    originContent: string;
  }) => void;
  onReasoning?: ({ reasoningContent }: { reasoningContent: string }) => void;
  onToolCalling?: ({
    toolCalls,
    toolCallResults
  }: {
    toolCalls: ChatCompletionChunk.Choice.Delta.ToolCall[];
    toolCallResults: ChatCompletionMessageToolCall[];
  }) => void;
  onFinished?: () => void;
};

type CreateCompleteResopnseEvents = {
  onReasoned?: ({ reasoningContent }: { reasoningContent: string }) => void;
  onToolCalled?: ({
    toolCalls
  }: {
    toolCalls: ChatCompletionMessageToolCall[];
  }) => ChatCompletionMessageToolCall[];
  onCompleted?: ({ content }: { content: string }) => void;
};

type CreateStreamResponseProps = {
  params: CreateStreamResponseParams;
} & CreateStreamResponseEvents;

type CreateCompleteResopnseProps = {
  params: CreateCompleteResopnseParams;
} & CreateCompleteResopnseEvents;

type StreamResponse = Omit<LLMResponse, 'inputTokens' | 'outputTokens' | 'getEmptyResponseTip'> & {
  usage?: CompletionUsage;
};

type CompleteResopnse = Omit<
  LLMResponse,
  'inputTokens' | 'outputTokens' | 'getEmptyResponseTip'
> & {
  usage?: CompletionUsage;
};

export const createLLMResponse = async <
  T extends ChatCompletionCreateParamsNonStreaming | ChatCompletionCreateParamsStreaming
>(
  args: CreateLLMResponseProps<T>
): Promise<LLMResponse> => {
  const { requestBody, userKey, params, events } = args;

  const { response, isStreamResponse, getEmptyResponseTip } = await createChatCompletion({
    body: requestBody,
    userKey,
    options: {
      headers: {
        Accept: 'application/json, text/plain, */*'
      }
    }
  });

  if (isStreamResponse) {
    const { usage, ...streamResults } = await createStreamResponse({
      params: { stream: response, ...params },
      ...events
    });

    return {
      inputTokens: usage?.prompt_tokens,
      outputTokens: usage?.completion_tokens,
      getEmptyResponseTip,
      ...streamResults
    };
  } else {
    const { usage, ...completeResults } = await createCompleteResponse({
      params: { completion: response, ...params },
      ...events
    });

    return {
      inputTokens: usage?.prompt_tokens,
      outputTokens: usage?.completion_tokens,
      getEmptyResponseTip,
      ...completeResults
    };
  }
};

export const createStreamResponse = async (
  args: CreateStreamResponseProps
): Promise<StreamResponse> => {
  const { params, ...events } = args;

  const { abortSignal, stream, reasoning, retainDatasetCite = true } = params;
  const { onStreaming, onReasoning, onToolCalling, onFinished } = events;

  const { parsePart, getResponseData, updateFinishReason } = parseLLMStreamResponse();

  let toolCallResults: ChatCompletionMessageToolCall[] = [];

  for await (const part of stream) {
    if (abortSignal) {
      stream.controller?.abort();
      updateFinishReason('close');
      break;
    }

    const responseChoice = part.choices?.[0]?.delta;
    const {
      reasoningContent,
      responseContent,
      content: originContent
    } = parsePart({
      part,
      parseThinkTag: true,
      retainDatasetCite
    });

    if (onReasoning && reasoning && reasoningContent) {
      onReasoning({ reasoningContent });
    }
    if (onStreaming && responseContent && originContent) {
      onStreaming({ responseContent, originContent });
    }
    if (onToolCalling && responseChoice?.tool_calls?.length) {
      onToolCalling({ toolCalls: responseChoice.tool_calls, toolCallResults });
    }
  }

  const { reasoningContent, content, finish_reason, usage } = getResponseData();

  if (onFinished) {
    onFinished();
  }

  return {
    answerText: content,
    reasoningText: reasoningContent,
    toolCallResults,
    finish_reason,
    usage
  };
};

export const createCompleteResponse = async (
  args: CreateCompleteResopnseProps
): Promise<CompleteResopnse> => {
  const { params, ...events } = args;

  const { completion, reasoning, retainDatasetCite = true } = params;
  const { onReasoned, onToolCalled, onCompleted } = events;

  const finish_reason = completion.choices?.[0]?.finish_reason as CompletionFinishReason;
  const toolCalls = completion.choices?.[0]?.message?.tool_calls || [];
  let toolCallResults: ChatCompletionMessageToolCall[] = [];
  const usage = completion.usage;

  const { content, reasoningContent } = (() => {
    const content = completion.choices?.[0]?.message?.content || '';
    // @ts-ignore
    const reasoningContent: string = completion.choices?.[0]?.message?.reasoning_content || '';

    // API already parse reasoning content
    if (reasoningContent || !reasoning) {
      return {
        content,
        reasoningContent
      };
    }

    const [think, answer] = parseReasoningContent(content);
    return {
      content: answer,
      reasoningContent: think
    };
  })();

  const formatReasonContent = removeDatasetCiteText(reasoningContent, retainDatasetCite);
  const formatContent = removeDatasetCiteText(content, retainDatasetCite);

  if (onReasoned && reasoning && reasoningContent) {
    onReasoned({ reasoningContent: formatReasonContent });
  }
  if (onToolCalled && toolCalls.length !== 0) {
    toolCallResults = onToolCalled({ toolCalls });
  }
  if (onCompleted && content) {
    onCompleted({ content: formatContent });
  }

  return {
    reasoningText: formatReasonContent,
    answerText: formatContent,
    toolCallResults,
    finish_reason,
    usage
  };
};
