import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { removeDatasetCiteText } from '@fastgpt/global/core/ai/llm/utils';
import { parsePromptToolCall } from '@fastgpt/service/core/ai/llm/promptCall';
import { parseReasoningContent } from '@fastgpt/service/core/ai/utils';
import { createCompleteResponse } from '@fastgpt/service/core/ai/llm/request/response/complete';

vi.mock('@fastgpt/global/core/ai/llm/utils', () => ({
  removeDatasetCiteText: vi.fn((text: string) => text)
}));

vi.mock('@fastgpt/service/core/ai/llm/promptCall', () => ({
  parsePromptToolCall: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/utils', () => ({
  parseReasoningContent: vi.fn()
}));

const mockRemoveDatasetCiteText = vi.mocked(removeDatasetCiteText);
const mockParsePromptToolCall = vi.mocked(parsePromptToolCall);
const mockParseReasoningContent = vi.mocked(parseReasoningContent);

const createModel = (overrides: Record<string, any> = {}) =>
  ({
    modelId: '68ad85a7463006c963799a63',
    type: ModelTypeEnum.llm,
    provider: 'openai',
    model: 'gpt-4o',
    name: 'GPT-4o',
    maxContext: 128000,
    maxResponse: 4096,
    quoteMaxToken: 60000,
    config: {
      maxContext: 128000,
      maxResponse: 4096,
      quoteMaxToken: 60000,
      reasoning: false,
      ...overrides
    }
  }) as any;

const createTool = (name = 'test_tool') => ({
  type: 'function' as const,
  function: {
    name,
    description: 'Test',
    parameters: { type: 'object', properties: {} }
  }
});

describe('createCompleteResponse', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRemoveDatasetCiteText.mockImplementation((text: string) => text);
  });

  it('should parse non-stream text response and emit streaming callback', async () => {
    let streamedText = '';
    const result = await createCompleteResponse({
      body: {
        model: createModel(),
        messages: [],
        stream: false
      },
      response: {
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Hello world'
            },
            finish_reason: 'stop'
          }
        ],
        usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 }
      } as any,
      onStreaming: ({ text }) => {
        streamedText += text;
      }
    });

    expect(result).toMatchObject({
      answerText: 'Hello world',
      reasoningText: '',
      finish_reason: 'stop',
      usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 }
    });
    expect(streamedText).toBe('Hello world');
  });

  it('should emit explicit reasoning_content before answer text', async () => {
    let reasoningText = '';
    let answerText = '';
    const result = await createCompleteResponse({
      body: {
        model: createModel({ reasoning: true }),
        messages: [],
        stream: false
      },
      response: {
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'final answer',
              reasoning_content: 'thinking'
            },
            finish_reason: 'stop'
          }
        ],
        usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 }
      } as any,
      onReasoning: ({ text }) => {
        reasoningText += text;
      },
      onStreaming: ({ text }) => {
        answerText += text;
      }
    });

    expect(result.reasoningText).toBe('thinking');
    expect(result.answerText).toBe('final answer');
    expect(reasoningText).toBe('thinking');
    expect(answerText).toBe('final answer');
  });

  it('should split think tag content when model supports reasoning but response has no reasoning_content', async () => {
    mockParseReasoningContent.mockReturnValue(['hidden reasoning', 'visible answer']);

    const result = await createCompleteResponse({
      body: {
        model: createModel({ reasoning: true }),
        messages: [],
        stream: false
      },
      response: {
        choices: [
          {
            message: {
              role: 'assistant',
              content: '<think>hidden reasoning</think>visible answer'
            },
            finish_reason: 'stop'
          }
        ]
      } as any
    });

    expect(mockParseReasoningContent).toHaveBeenCalledWith(
      '<think>hidden reasoning</think>visible answer'
    );
    expect(result.reasoningText).toBe('hidden reasoning');
    expect(result.answerText).toBe('visible answer');
  });

  it('should filter toolChoice calls to function calls and emit onToolCall', async () => {
    const toolCalls: any[] = [];
    const result = await createCompleteResponse({
      body: {
        model: createModel(),
        messages: [],
        tools: [createTool()],
        stream: false
      },
      response: {
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call_fn',
                  type: 'function',
                  function: { name: 'test_tool', arguments: '{}' }
                },
                {
                  id: 'call_custom',
                  type: 'custom',
                  custom: { name: 'shell', input: 'ls' }
                }
              ]
            },
            finish_reason: 'tool_calls'
          }
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
      } as any,
      onToolCall: ({ call }) => {
        toolCalls.push(call);
      }
    });

    expect(result.toolCalls).toEqual([
      {
        id: 'call_fn',
        type: 'function',
        function: { name: 'test_tool', arguments: '{}' }
      }
    ]);
    expect(toolCalls).toEqual(result.toolCalls);
  });

  it('should normalize and filter native calls before emitting their callbacks', async () => {
    const onToolCall = vi.fn();
    const result = await createCompleteResponse({
      body: { model: createModel(), messages: [], stream: false, tools: [createTool('search')] },
      response: {
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'valid',
                  type: 'function',
                  function: { name: 'functions.search', arguments: ' \t' }
                },
                { id: 'invalid', type: 'function', function: { name: 'unknown', arguments: '{}' } }
              ]
            },
            finish_reason: 'tool_calls'
          }
        ]
      } as any,
      onToolCall
    });
    expect(result.error).toBeUndefined();
    expect(result.toolCalls).toEqual([
      { id: 'valid', type: 'function', function: { name: 'search', arguments: '{}' } }
    ]);
    expect(onToolCall).toHaveBeenCalledExactlyOnceWith({ call: result.toolCalls?.[0] });
  });

  it('should not crash when a non-stream native call has null or object arguments', async () => {
    const onToolCall = vi.fn();
    const result = await createCompleteResponse({
      body: { model: createModel(), messages: [], stream: false, tools: [createTool('search')] },
      response: {
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'null_args',
                  type: 'function',
                  function: { name: 'search', arguments: null }
                },
                {
                  id: 'object_args',
                  type: 'function',
                  function: { name: 'search', arguments: { q: 'fastgpt' } }
                }
              ]
            },
            finish_reason: 'tool_calls'
          }
        ]
      } as any,
      onToolCall
    });
    expect(result.error).toBeUndefined();
    expect(result.toolCalls).toEqual([
      { id: 'null_args', type: 'function', function: { name: 'search', arguments: '{}' } },
      {
        id: 'object_args',
        type: 'function',
        function: { name: 'search', arguments: '{"q":"fastgpt"}' }
      }
    ]);
    expect(onToolCall).toHaveBeenCalledTimes(2);
  });

  it.each([false, true])(
    'should retain invalid native output for entry validation without callbacks: upstream error=%s',
    async (withUpstreamError) => {
      const error = new Error('upstream failed');
      const onToolCall = vi.fn();
      const result = await createCompleteResponse({
        body: { model: createModel(), messages: [], stream: false, tools: [createTool('search')] },
        response: {
          error: withUpstreamError ? error : undefined,
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'partial answer',
                tool_calls: [
                  {
                    id: 'invalid',
                    type: 'function',
                    function: { name: 'unknown', arguments: '{}' }
                  }
                ]
              },
              finish_reason: 'tool_calls'
            }
          ]
        } as any,
        onToolCall
      });
      expect(onToolCall).not.toHaveBeenCalled();
      expect(result.answerText).toBe('partial answer');
      expect(result.toolCalls).toEqual([]);
      expect(result.finish_reason).toBe('tool_calls');
      expect(result.error).toBe(withUpstreamError ? error : undefined);
    }
  );

  it('should parse prompt tool response text and expose parsed tool calls', async () => {
    mockParsePromptToolCall.mockReturnValue({
      answer: 'visible answer',
      toolCalls: [
        {
          id: 'call_prompt',
          type: 'function',
          function: { name: 'search', arguments: '{"q":"fastgpt"}' }
        }
      ]
    });

    let streamedText = '';
    const onToolCall = vi.fn();
    const result = await createCompleteResponse({
      body: {
        model: createModel(),
        messages: [],
        tools: [createTool('search')],
        toolCallMode: 'prompt',
        stream: false
      },
      response: {
        choices: [
          {
            message: {
              role: 'assistant',
              content: '1: {"name":"search"}'
            },
            finish_reason: 'tool_calls'
          }
        ]
      } as any,
      onStreaming: ({ text }) => {
        streamedText += text;
      },
      onToolCall
    });

    expect(mockParsePromptToolCall).toHaveBeenCalledWith('1: {"name":"search"}');
    expect(result.answerText).toBe('visible answer');
    expect(result.toolCalls).toHaveLength(1);
    expect(streamedText).toBe('visible answer');
    expect(onToolCall).toHaveBeenCalledWith({
      call: {
        id: 'call_prompt',
        type: 'function',
        function: { name: 'search', arguments: '{"q":"fastgpt"}' }
      }
    });
  });
});
