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
  reasoning: boolean;
  abortSignal?: boolean;
  retainDatasetCite?: boolean;
};

type CreateLLMResponseProps = {
  requestBody: ChatCompletionCreateParamsNonStreaming | ChatCompletionCreateParamsStreaming;
  params: BasicResponseParams;
  userKey?: OpenaiAccountType;
  events?: CreateStreamResponseEvents & CreateCompleteResopnseEvents;
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

type CreateCompleteResopnseParams = Omit<BasicResponseParams, 'abortSignal'> & {
  completion: ChatCompletion;
};

type CreateStreamResponseEvents = {
  streamEvents?: {
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
};

type CreateCompleteResopnseEvents = {
  completionEvents?: {
    onReasoned?: ({ reasoningContent }: { reasoningContent: string }) => void;
    onToolCalled?: ({
      toolCalls
    }: {
      toolCalls: ChatCompletionMessageToolCall[];
    }) => ChatCompletionMessageToolCall[];
    onCompleted?: ({ content }: { content: string }) => void;
  };
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

export const createLLMResponse = async (args: CreateLLMResponseProps): Promise<LLMResponse> => {
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

  const { parsePart, getResponseData, updateFinishReason } = parseLLMStreamResponse();

  let toolCallResults: ChatCompletionMessageToolCall[] = [];

  if (abortSignal) {
    return {
      reasoningText: '',
      answerText: '',
      toolCallResults: [],
      finish_reason: 'close',
      usage: {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0
      }
    };
  }

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

    if (events?.streamEvents?.onReasoning && reasoning && reasoningContent) {
      events?.streamEvents?.onReasoning({ reasoningContent });
    }
    if (events?.streamEvents?.onStreaming && responseContent && originContent) {
      events?.streamEvents?.onStreaming({ responseContent, originContent });
    }
    if (events?.streamEvents?.onToolCalling && responseChoice?.tool_calls?.length) {
      events?.streamEvents?.onToolCalling({
        toolCalls: responseChoice.tool_calls,
        toolCallResults
      });
    }
  }

  const { reasoningContent, content, finish_reason, usage } = getResponseData();

  if (events?.streamEvents?.onFinished) {
    events?.streamEvents?.onFinished();
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

  if (events?.completionEvents?.onReasoned && reasoning && reasoningContent) {
    events?.completionEvents?.onReasoned({ reasoningContent: formatReasonContent });
  }
  if (events?.completionEvents?.onToolCalled && toolCalls.length !== 0) {
    toolCallResults = events?.completionEvents?.onToolCalled({ toolCalls });
  }
  if (events?.completionEvents?.onCompleted && content) {
    events?.completionEvents?.onCompleted({ content: formatContent });
  }

  return {
    reasoningText: formatReasonContent,
    answerText: formatContent,
    toolCallResults,
    finish_reason,
    usage
  };
};
