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
  it.each([true, false])(
    'preserves empty reasoning for tool history and omits unexecuted tool_calls from continuation: %s',
    (supportReason) => {
      const accumulator = useLLMResponseAccumulator({ supportReason });
      accumulator.appendResponse({
        answerText: '',
        reasoningText: '',
        finish_reason: 'tool_calls',
        toolCalls: [createToolCall('call_empty_reasoning', 'search', '{}')]
      });

      const assistant = accumulator.getResponse().assistantMessage;
      expect(assistant.tool_calls).toEqual([
        createToolCall('call_empty_reasoning', 'search', '{}')
      ]);
      // 仅含未执行 tool_calls 且无正文/思考时，续写请求不应发送空 assistant 或悬空 tool_calls。
      expect(accumulator.buildContinuationMessages({ baseMessages: [] })).toEqual([
        { role: ChatCompletionRequestMessageRoleEnum.User, content: '[继续输出]' }
      ]);

      // 有思考内容但无正文时，移除未执行 tool_calls 后仍缺少 content，续写同样省略该 assistant 消息。
      const reasoningOnly = useLLMResponseAccumulator({ supportReason });
      reasoningOnly.appendResponse({
        answerText: '',
        reasoningText: 'only thinking',
        finish_reason: 'length',
        toolCalls: [createToolCall('call_reasoning_only', 'search', '{}')]
      });
      expect(reasoningOnly.buildContinuationMessages({ baseMessages: [] })).toEqual([
        { role: ChatCompletionRequestMessageRoleEnum.User, content: '[继续输出]' }
      ]);
      const serialized = JSON.parse(JSON.stringify(assistant));
      if (supportReason) {
        expect(serialized).toHaveProperty('reasoning_content', '');
      } else {
        expect(serialized).not.toHaveProperty('reasoning_content');
      }
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
        total_tokens: 12,
        cache_creation_tokens: 1,
        prompt_tokens_details: { cached_tokens: 6 }
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
        total_tokens: 7,
        prompt_tokens_details: { cached_tokens: 2, cache_write_tokens: 1 }
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
      total_tokens: 19,
      cache_read_tokens: 8,
      cache_write_tokens: 2
    });
    expect(response.toolCalls).toEqual([
      createToolCall('call_1', 'search', '{}'),
      createToolCall('call_2', 'read_file', '{"path":"a"}')
    ]);
  });

  it('should build continuation messages from replayable assistant text/reasoning without unexecuted tool_calls', () => {
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
        content: 'partial',
        reasoning_content: 'reasoning'
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.User,
        content: '[继续输出]'
      }
    ]);
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

  it('keeps per-round error record redaction and moderation precedence when a tool call id is reused across rounds', () => {
    const accumulator = useLLMResponseAccumulator();
    accumulator.appendResponse({
      answerText: '',
      reasoningText: '',
      finish_reason: 'length',
      toolCalls: [createToolCall('dup_id', 'search', '{}')],
      rawToolCalls: [createToolCall('dup_id', 'search', '{"q":"toxic"}')],
      errorRecordToolCalls: [createToolCall('dup_id', 'search', '{}')],
      blockedToolCalls: { dup_id: 'moderation' }
    });
    accumulator.appendResponse({
      answerText: '',
      reasoningText: '',
      finish_reason: 'length',
      toolCalls: [createToolCall('dup_id', 'search', '{}')],
      rawToolCalls: [createToolCall('dup_id', 'search', '{"q":"clean-trunc')],
      blockedToolCalls: { dup_id: 'length' }
    });

    const response = accumulator.getResponse();
    expect(response.blockedToolCalls).toEqual({ dup_id: 'moderation' });
    expect(response.rawToolCalls).toEqual([
      createToolCall('dup_id', 'search', '{"q":"toxic"}'),
      createToolCall('dup_id', 'search', '{"q":"clean-trunc')
    ]);
    expect(response.errorRecordToolCalls).toEqual([
      createToolCall('dup_id', 'search', '{}'),
      createToolCall('dup_id', 'search', '{"q":"clean-trunc')
    ]);
  });

  it('keeps empty provider usage at zero', () => {
    const accumulator = useLLMResponseAccumulator();
    accumulator.appendResponse({
      answerText: '',
      reasoningText: '',
      finish_reason: 'stop',
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
    });
    expect(accumulator.getResponse().usage).toMatchObject({
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      cache_read_tokens: 0,
      cache_write_tokens: 0
    });
  });
});
