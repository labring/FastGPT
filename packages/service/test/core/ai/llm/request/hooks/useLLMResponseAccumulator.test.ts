import { describe, expect, it } from 'vitest';
import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import type { ChatCompletionMessageToolCall } from '@fastgpt/global/core/ai/llm/type';
import { useLLMResponseAccumulator } from '@fastgpt/service/core/ai/llm/request/hooks/useLLMResponseAccumulator';

const createToolCall = (id: string, name: string, args = ''): ChatCompletionMessageToolCall => ({
  id,
  type: 'function',
  function: {
    name,
    arguments: args
  }
});

describe('useLLMResponseAccumulator', () => {
  it('should keep the first response type and accumulate text, tool calls, usage', () => {
    const accumulator = useLLMResponseAccumulator();

    accumulator.setFirstResponseType(true);
    accumulator.setFirstResponseType(false);
    accumulator.appendResponse({
      answerText: 'hello ',
      reasoningText: 'think ',
      finish_reason: 'length',
      toolCalls: [createToolCall('call_1', 'search')],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 2,
        total_tokens: 12
      }
    });
    accumulator.appendResponse({
      answerText: 'world',
      reasoningText: 'done',
      finish_reason: 'stop',
      toolCalls: [createToolCall('call_2', 'read_file', '{"path":"a"}')],
      usage: {
        prompt_tokens: 3,
        completion_tokens: 4,
        total_tokens: 7
      }
    });

    const response = accumulator.getResponse();

    expect(response.isStreamResponse).toBe(true);
    expect(response.answerText).toBe('hello world');
    expect(response.reasoningText).toBe('think done');
    expect(response.finish_reason).toBe('stop');
    expect(response.usage).toMatchObject({
      prompt_tokens: 13,
      completion_tokens: 6,
      total_tokens: 19
    });
    expect(response.toolCalls).toEqual([
      createToolCall('call_1', 'search', '{}'),
      createToolCall('call_2', 'read_file', '{"path":"a"}')
    ]);
  });

  it('should build continuation messages from accumulated assistant content', () => {
    const accumulator = useLLMResponseAccumulator();
    const baseMessages = [
      {
        role: ChatCompletionRequestMessageRoleEnum.User as 'user',
        content: 'start'
      }
    ];

    accumulator.appendResponse({
      answerText: 'partial',
      reasoningText: 'reasoning',
      finish_reason: 'length',
      toolCalls: [createToolCall('call_1', 'search', '{"q":"x"}')]
    });

    expect(accumulator.shouldContinue()).toBe(true);
    expect(accumulator.buildContinuationMessages({ baseMessages })).toEqual([
      ...baseMessages,
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        tool_calls: [createToolCall('call_1', 'search', '{"q":"x"}')]
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: 'partial',
        reasoning_content: 'reasoning'
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.User,
        content: '[继续输出]'
      }
    ]);
  });

  it('should stop continuation when the length response has error', () => {
    const accumulator = useLLMResponseAccumulator();
    const error = new Error('stream failed');

    accumulator.appendResponse({
      answerText: '',
      reasoningText: '',
      finish_reason: 'length',
      error
    });

    expect(accumulator.shouldContinue()).toBe(false);
    expect(accumulator.getResponse().error).toBe(error);
  });
});
