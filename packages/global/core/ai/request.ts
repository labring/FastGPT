import type {
  ChatCompletion,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming,
  ChatCompletionMessageToolCall,
  ChatCompletionToolType,
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
import type { OpenaiAccountType } from '../../support/user/team/type';
import { getNanoid } from '../../common/string/tools';

type BasicResponseParams = {
  reasoning?: boolean;
  toolMode?: 'toolChoice' | 'prompt';
  abortSignal?: () => boolean | undefined;
  retainDatasetCite?: boolean;
};

type CreateStreamResponseParams = BasicResponseParams & {
  stream: StreamChatType;
};

type CreateCompleteResopnseParams = Omit<BasicResponseParams, 'abortSignal'> & {
  completion: ChatCompletion;
};

type ResponseEvents = {
  onStreaming?: ({ responseContent }: { responseContent: string }) => void;
  onReasoning?: ({ reasoningContent }: { reasoningContent: string }) => void;
  onToolCalling?: ({
    callingTool,
    toolId
  }: {
    callingTool: { name: string; arguments: string };
    toolId: string;
  }) => void;
  onToolParaming?: ({
    currentTool,
    params
  }: {
    currentTool: ChatCompletionMessageToolCall;
    params: string;
  }) => void;
  onReasoned?: ({ reasoningContent }: { reasoningContent: string }) => void;
  onToolCalled?: ({ calls }: { calls: ChatCompletionMessageToolCall[] }) => void;
  onCompleted?: ({ responseContent }: { responseContent: string }) => void;
};

type CreateStreamResponseProps = {
  params: CreateStreamResponseParams;
} & ResponseEvents;

type CreateCompleteResopnseProps = {
  params: CreateCompleteResopnseParams;
} & ResponseEvents;

type CreateLLMResponseProps = {
  llmOptions: Omit<
    ChatCompletionCreateParamsNonStreaming | ChatCompletionCreateParamsStreaming,
    'tools'
  >;
  params: BasicResponseParams;
  tools: ChatCompletionToolType[];
  userKey?: OpenaiAccountType;
} & ResponseEvents;

type LLMResponse = {
  answerText: string;
  reasoningText: string;
  toolCalls: ChatCompletionMessageToolCall[];
  finish_reason: CompletionFinishReason;
  isStreamResponse: boolean;
  getEmptyResponseTip: () => string;
  inputTokens: number;
  outputTokens: number;
};

type StreamResponse = Pick<
  LLMResponse,
  'answerText' | 'reasoningText' | 'toolCalls' | 'finish_reason'
> & {
  usage?: CompletionUsage;
};

type CompleteResopnse = Pick<
  LLMResponse,
  'answerText' | 'reasoningText' | 'toolCalls' | 'finish_reason'
> & {
  usage?: CompletionUsage;
};

export const createLLMResponse = async (args: CreateLLMResponseProps): Promise<LLMResponse> => {
  const { llmOptions, tools, userKey, params, ...events } = args;

  const body: ChatCompletionCreateParamsNonStreaming | ChatCompletionCreateParamsStreaming = {
    tools,
    ...llmOptions
  };

  const { response, isStreamResponse, getEmptyResponseTip } = await createChatCompletion({
    body,
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
      inputTokens: usage?.prompt_tokens ?? 0,
      outputTokens: usage?.completion_tokens ?? 0,
      isStreamResponse,
      getEmptyResponseTip,
      ...streamResults
    };
  } else {
    const { usage, ...completeResults } = await createCompleteResponse({
      params: { completion: response, ...params },
      ...events
    });

    return {
      inputTokens: usage?.prompt_tokens ?? 0,
      outputTokens: usage?.completion_tokens ?? 0,
      isStreamResponse,
      getEmptyResponseTip,
      ...completeResults
    };
  }
};

export const createStreamResponse = async (
  args: CreateStreamResponseProps
): Promise<StreamResponse> => {
  const { params, ...events } = args;

  const {
    abortSignal,
    stream,
    reasoning,
    retainDatasetCite = true,
    toolMode = 'toolChoice'
  } = params;

  const { parsePart, getResponseData, updateFinishReason } = parseLLMStreamResponse();

  let calls: ChatCompletionMessageToolCall[] = [];
  let startResponseWrite = false;
  let answer = '';

  for await (const part of stream) {
    if (abortSignal && abortSignal()) {
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

    if (reasoning && reasoningContent) {
      events?.onReasoning?.({ reasoningContent });
    }
    if (responseContent && originContent) {
      if (toolMode === 'prompt') {
        answer += originContent;
        if (startResponseWrite) {
          events?.onStreaming?.({ responseContent });
        } else if (answer.length >= 3) {
          answer = answer.trimStart();
          if (/0(:|：)/.test(answer)) {
            startResponseWrite = true;

            // find first : index
            const firstIndex =
              answer.indexOf('0:') !== -1 ? answer.indexOf('0:') : answer.indexOf('0：');
            answer = answer.substring(firstIndex + 2).trim();

            events?.onStreaming?.({ responseContent: answer });
          }
        }
      } else {
        events?.onStreaming?.({ responseContent });
      }
    }
    if (responseChoice?.tool_calls?.length) {
      let callingTool: { name: string; arguments: string } | null = null;
      responseChoice.tool_calls.forEach((toolCall, i) => {
        const index = toolCall.index ?? i;

        // Call new tool
        const hasNewTool = toolCall?.function?.name || callingTool;
        if (hasNewTool) {
          // 有 function name，代表新 call 工具
          if (toolCall?.function?.name) {
            callingTool = {
              name: toolCall.function?.name || '',
              arguments: toolCall.function?.arguments || ''
            };
          } else if (callingTool) {
            // Continue call(Perhaps the name of the previous function was incomplete)
            callingTool.name += toolCall.function?.name || '';
            callingTool.arguments += toolCall.function?.arguments || '';
          }

          if (!callingTool) {
            return;
          }

          const toolId = getNanoid();

          events?.onToolCalling?.({ callingTool, toolId });

          calls[index] = {
            ...toolCall,
            id: toolId,
            type: 'function',
            function: callingTool
          };
          callingTool = null;
        } else {
          /* 追加到当前工具的参数里 */
          const arg: string = toolCall?.function?.arguments ?? '';
          const currentTool = calls[index];
          if (currentTool && arg) {
            currentTool.function.arguments += arg;
            events?.onToolParaming?.({ currentTool, params: arg });
          }
        }
      });
    }
  }

  const { reasoningContent, content, finish_reason, usage } = getResponseData();

  return {
    answerText: content,
    reasoningText: reasoningContent,
    toolCalls: calls.filter(Boolean),
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
  const calls = completion.choices?.[0]?.message?.tool_calls || [];
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

  if (reasoning && reasoningContent) {
    events?.onReasoned?.({ reasoningContent: formatReasonContent });
  }
  if (calls.length !== 0) {
    events?.onToolCalled?.({ calls });
  }
  if (content) {
    events?.onCompleted?.({ responseContent: formatContent });
  }

  return {
    reasoningText: formatReasonContent,
    answerText: formatContent,
    toolCalls: calls,
    finish_reason,
    usage
  };
};
