import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall
} from '@fastgpt/global/core/ai/llm/type';
import type { Mock } from 'vitest';

type CreateLLMResponseArgs = {
  body: {
    messages: ChatCompletionMessageParam[];
  };
  onStreaming?: (e: { text: string }) => void;
  onReasoning?: (e: { text: string }) => void;
  onToolCall?: (e: { call: ChatCompletionMessageToolCall }) => void;
};

type LLMQueueItem = {
  requestId?: string;
  answerText?: string;
  reasoningText?: string;
  toolCalls?: ChatCompletionMessageToolCall[];
  finishReason?: 'stop' | 'tool_calls' | 'error' | 'length';
  responseEmptyTip?: string;
  error?: unknown;
  inputTokens?: number;
  outputTokens?: number;
  usedUserOpenAIKey?: boolean;
};

const stringifyArgs = (args: string | Record<string, unknown>) =>
  typeof args === 'string' ? args : JSON.stringify(args);

export const toolCall = ({
  id,
  name,
  args = {}
}: {
  id?: string;
  name: string;
  args?: string | Record<string, unknown>;
}): LLMQueueItem => ({
  requestId: `req_${id || name}`,
  finishReason: 'tool_calls',
  toolCalls: [
    {
      id: id || `call_${name}`,
      type: 'function',
      function: {
        name,
        arguments: stringifyArgs(args)
      }
    }
  ],
  inputTokens: 100,
  outputTokens: 20
});

export const text = ({
  requestId,
  content,
  reasoning
}: {
  requestId?: string;
  content: string;
  reasoning?: string;
}): LLMQueueItem => ({
  requestId: requestId || `req_text_${content.slice(0, 8)}`,
  answerText: content,
  reasoningText: reasoning || '',
  finishReason: 'stop',
  inputTokens: 100,
  outputTokens: 30
});

export const mockCreateLLMResponseQueue = (createLLMResponseMock: Mock, queue: LLMQueueItem[]) => {
  const items = [...queue];

  createLLMResponseMock.mockImplementation(async (args: CreateLLMResponseArgs) => {
    const item = items.shift();

    if (!item) {
      throw new Error('No mock LLM response left in queue');
    }

    if (item.reasoningText) {
      args.onReasoning?.({ text: item.reasoningText });
    }
    if (item.answerText) {
      args.onStreaming?.({ text: item.answerText });
    }
    item.toolCalls?.forEach((call) => {
      args.onToolCall?.({ call });
    });

    const assistantMessage: ChatCompletionMessageParam = {
      role: ChatCompletionRequestMessageRoleEnum.Assistant,
      ...(item.answerText && { content: item.answerText }),
      ...(item.reasoningText && { reasoning_content: item.reasoningText }),
      ...(item.toolCalls?.length && { tool_calls: item.toolCalls })
    };

    return {
      requestId: item.requestId || `req_${queue.length - items.length}`,
      error: item.error,
      isStreamResponse: false,
      responseEmptyTip: item.responseEmptyTip,
      answerText: item.answerText || '',
      reasoningText: item.reasoningText || '',
      toolCalls: item.toolCalls,
      finish_reason: item.finishReason || 'stop',
      usage: {
        inputTokens: item.inputTokens ?? 0,
        outputTokens: item.outputTokens ?? 0,
        usedUserOpenAIKey: item.usedUserOpenAIKey ?? false
      },
      requestMessages: args.body.messages,
      assistantMessage,
      completeMessages: [...args.body.messages, assistantMessage]
    };
  });
};
