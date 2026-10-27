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
  it.each([false, true])(
    'normalizes empty reasoning only for reasoning models: supportReason=%s',
    (supportReason) => {
      const accumulator = useLLMResponseAccumulator({ supportReason });
      accumulator.appendResponse({ answerText: 'Done', reasoningText: '', finish_reason: 'stop' });
      const message = JSON.parse(JSON.stringify(accumulator.getResponse().assistantMessage));
      if (supportReason) expect(message).toHaveProperty('reasoning_content', '');
      else expect(message).not.toHaveProperty('reasoning_content');
    }
  );

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
      finish_reason: 'length'
    });

    expect(accumulator.shouldContinue()).toBe(true);
    expect(accumulator.buildContinuationMessages({ baseMessages })).toEqual([
      ...baseMessages,
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

  it('should return truncated tool calls to the caller without requesting a continuation', () => {
    const accumulator = useLLMResponseAccumulator();
    const toolCalls = [createToolCall('call_1', 'search', '{"q":"x"}')];
    accumulator.appendResponse({
      answerText: 'Searching',
      reasoningText: 'Inspect first',
      finish_reason: 'length',
      toolCalls
    });

    expect(accumulator.shouldContinue()).toBe(false);
    expect(accumulator.getResponse()).toMatchObject({ finish_reason: 'length', toolCalls });
  });

  it('should preserve truncated reasoning for display without generating an invalid continuation', () => {
    const accumulator = useLLMResponseAccumulator();
    accumulator.appendResponse({
      answerText: '',
      reasoningText: 'Still thinking',
      finish_reason: 'length'
    });

    expect(accumulator.shouldContinue()).toBe(false);
    expect(accumulator.getResponse()).toMatchObject({
      answerText: '',
      reasoningText: 'Still thinking',
      finish_reason: 'length'
    });
  });

  it('should preserve earlier valid tools when the last round has no tools', () => {
    const accumulator = useLLMResponseAccumulator();
    accumulator.appendResponse({
      answerText: 'first',
      reasoningText: '',
      finish_reason: 'length',
      toolCalls: [createToolCall('call_1', 'search', '{}')]
    });
    accumulator.appendResponse({
      answerText: 'second',
      reasoningText: '',
      finish_reason: 'tool_calls',
      toolCalls: []
    });

    const response = accumulator.getResponse();
    expect(response.finish_reason).toBe('tool_calls');
    expect(response.toolCalls).toEqual([createToolCall('call_1', 'search', '{}')]);
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
