import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { StreamResponseType } from '@fastgpt/global/core/ai/llm/type';
import { parseLLMStreamResponse } from '@fastgpt/service/core/ai/utils';
import { getLLMModel } from '@fastgpt/service/core/ai/model';
import { parsePromptToolCall } from '@fastgpt/service/core/ai/llm/promptCall';
import { createStreamResponse } from '@fastgpt/service/core/ai/llm/request/response/stream';

vi.mock('@fastgpt/service/core/ai/utils', () => ({
  parseLLMStreamResponse: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/model', () => ({
  getLLMModel: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/llm/promptCall', () => ({
  parsePromptToolCall: vi.fn()
}));

const mockParseLLMStreamResponse = vi.mocked(parseLLMStreamResponse);
const mockGetLLMModel = vi.mocked(getLLMModel);
const mockParsePromptToolCall = vi.mocked(parsePromptToolCall);

async function* createAsyncGenerator<T>(items: T[]): AsyncGenerator<T, void, unknown> {
  for (const item of items) {
    yield item;
  }
}

const createMockStreamResponse = (chunks: any[]): StreamResponseType => {
  const generator = createAsyncGenerator(chunks);
  return Object.assign(generator, {
    controller: { abort: vi.fn() }
  }) as unknown as StreamResponseType;
};

const createModel = (overrides: Record<string, any> = {}) =>
  ({
    type: ModelTypeEnum.llm,
    provider: 'openai',
    model: 'gpt-4o',
    name: 'GPT-4o',
    maxContext: 128000,
    maxResponse: 4096,
    quoteMaxToken: 60000,
    reasoning: false,
    ...overrides
  }) as any;

describe('createStreamResponse', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetLLMModel.mockReturnValue(createModel());
  });

  it('should parse plain streamed text and emit streaming callback', async () => {
    const chunks = [
      { choices: [{ delta: { content: 'Hello' }, finish_reason: null }] },
      { choices: [{ delta: { content: ' world' }, finish_reason: 'stop' }] }
    ];

    let contentBuffer = '';
    mockParseLLMStreamResponse.mockReturnValue({
      parsePart: ({ part }: { part: any }) => {
        const content = part.choices?.[0]?.delta?.content || '';
        contentBuffer += content;
        return {
          reasoningContent: '',
          content,
          responseContent: content,
          finishReason: part.choices?.[0]?.finish_reason || null
        };
      },
      getResponseData: () => ({
        error: undefined,
        reasoningContent: '',
        content: contentBuffer,
        finish_reason: 'stop' as const,
        usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 }
      }),
      updateFinishReason: vi.fn(),
      updateError: vi.fn()
    });

    let streamedText = '';
    const result = await createStreamResponse({
      body: {
        model: 'gpt-4o',
        messages: [],
        stream: true
      },
      response: createMockStreamResponse(chunks),
      onStreaming: ({ text }) => {
        streamedText += text;
      }
    });

    expect(result.answerText).toBe('Hello world');
    expect(result.reasoningText).toBe('');
    expect(result.finish_reason).toBe('stop');
    expect(streamedText).toBe('Hello world');
  });

  it('should parse streamed reasoning content and answer content separately', async () => {
    mockGetLLMModel.mockReturnValue(createModel({ reasoning: true }));

    const chunks = [
      { choices: [{ delta: { reasoning_content: 'Thinking...' }, finish_reason: null }] },
      { choices: [{ delta: { content: 'Answer' }, finish_reason: 'stop' }] }
    ];

    let contentBuffer = '';
    let reasoningBuffer = '';
    mockParseLLMStreamResponse.mockReturnValue({
      parsePart: ({ part }: { part: any }) => {
        const content = part.choices?.[0]?.delta?.content || '';
        const reasoning = part.choices?.[0]?.delta?.reasoning_content || '';
        contentBuffer += content;
        reasoningBuffer += reasoning;
        return {
          reasoningContent: reasoning,
          content,
          responseContent: content,
          finishReason: part.choices?.[0]?.finish_reason || null
        };
      },
      getResponseData: () => ({
        error: undefined,
        reasoningContent: reasoningBuffer,
        content: contentBuffer,
        finish_reason: 'stop' as const,
        usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 }
      }),
      updateFinishReason: vi.fn(),
      updateError: vi.fn()
    });

    let reasoningText = '';
    let answerText = '';
    const result = await createStreamResponse({
      body: {
        model: 'gpt-4o',
        messages: [],
        stream: true
      },
      response: createMockStreamResponse(chunks),
      onReasoning: ({ text }) => {
        reasoningText += text;
      },
      onStreaming: ({ text }) => {
        answerText += text;
      }
    });

    expect(result.reasoningText).toBe('Thinking...');
    expect(result.answerText).toBe('Answer');
    expect(reasoningText).toBe('Thinking...');
    expect(answerText).toBe('Answer');
  });

  it('should parse toolChoice stream tool call and append argument deltas', async () => {
    const updateError = vi.fn();
    const chunks = [
      {
        choices: [
          {
            delta: {
              content: 'visible',
              tool_calls: [
                {
                  index: 0,
                  id: 'call_1',
                  function: {
                    name: 'search',
                    arguments: '{"q"'
                  }
                }
              ]
            }
          }
        ]
      },
      {
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  function: {
                    arguments: ':"fastgpt"}'
                  }
                }
              ]
            }
          }
        ]
      }
    ];

    mockParseLLMStreamResponse.mockReturnValue({
      parsePart: ({ part }: { part: any }) => ({
        reasoningContent: part.choices?.[0]?.delta?.reasoning_content || '',
        content: part.choices?.[0]?.delta?.content || '',
        responseContent: part.choices?.[0]?.delta?.content || ''
      }),
      getResponseData: () => ({
        error: undefined,
        reasoningContent: '',
        content: 'visible',
        finish_reason: 'tool_calls' as const,
        usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 }
      }),
      updateFinishReason: vi.fn(),
      updateError
    });

    const onStreaming = vi.fn();
    const onToolCall = vi.fn();
    const onToolParam = vi.fn();
    const result = await createStreamResponse({
      body: {
        model: 'gpt-4o',
        messages: [],
        stream: true,
        tools: [
          {
            type: 'function',
            function: {
              name: 'search',
              description: 'search',
              parameters: { type: 'object' }
            }
          }
        ],
        toolCallMode: 'toolChoice'
      },
      response: createMockStreamResponse(chunks),
      onStreaming,
      onToolCall,
      onToolParam
    });

    expect(onStreaming).toHaveBeenCalledWith({ text: 'visible' });
    expect(onToolCall).toHaveBeenCalledTimes(1);
    expect(onToolParam).toHaveBeenCalledWith({
      call: expect.objectContaining({
        id: 'call_1',
        function: {
          name: 'search',
          arguments: '{"q":"fastgpt"}'
        }
      }),
      argsDelta: ':"fastgpt"}'
    });
    expect(result.toolCalls).toEqual([
      {
        id: 'call_1',
        type: 'function',
        function: {
          name: 'search',
          arguments: '{"q":"fastgpt"}'
        }
      }
    ]);
    expect(result.finish_reason).toBe('tool_calls');
    expect(updateError).not.toHaveBeenCalled();
  });

  it('should parse prompt tool stream and emit parsed tool calls after stream ends', async () => {
    const chunks = [
      { choices: [{ delta: { content: '  0: hel' } }] },
      { choices: [{ delta: { content: 'lo' } }] }
    ];
    mockParseLLMStreamResponse.mockReturnValue({
      parsePart: ({ part }: { part: any }) => {
        const content = part.choices?.[0]?.delta?.content || '';
        return {
          reasoningContent: '',
          content,
          responseContent: content
        };
      },
      getResponseData: () => ({
        error: undefined,
        reasoningContent: 'reasoning',
        content: '0: hello',
        finish_reason: 'stop' as const,
        usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 }
      }),
      updateFinishReason: vi.fn(),
      updateError: vi.fn()
    });
    mockParsePromptToolCall.mockReturnValue({
      answer: 'hello',
      streamAnswer: ' parsed-tail',
      toolCalls: [
        {
          id: 'call_prompt',
          type: 'function',
          function: {
            name: 'search',
            arguments: '{"q":"fastgpt"}'
          }
        }
      ]
    });

    let streamedText = '';
    const onToolCall = vi.fn();
    const result = await createStreamResponse({
      body: {
        model: 'gpt-4o',
        messages: [],
        stream: true,
        tools: [
          {
            type: 'function',
            function: {
              name: 'search',
              description: 'search',
              parameters: { type: 'object' }
            }
          }
        ],
        toolCallMode: 'prompt'
      },
      response: createMockStreamResponse(chunks),
      onStreaming: ({ text }) => {
        streamedText += text;
      },
      onToolCall
    });

    expect(streamedText).toBe('hello parsed-tail');
    expect(mockParsePromptToolCall).toHaveBeenCalledWith('0: hello');
    expect(onToolCall).toHaveBeenCalledWith({
      call: {
        id: 'call_prompt',
        type: 'function',
        function: {
          name: 'search',
          arguments: '{"q":"fastgpt"}'
        }
      }
    });
    expect(result).toMatchObject({
      answerText: 'hello',
      reasoningText: 'reasoning',
      finish_reason: 'stop'
    });
  });

  it('should suppress prompt tool streaming before model declares tool mode', async () => {
    const chunks = [{ choices: [{ delta: { content: '1: {"tool"' } }] }];
    mockParseLLMStreamResponse.mockReturnValue({
      parsePart: ({ part }: { part: any }) => {
        const content = part.choices?.[0]?.delta?.content || '';
        return {
          reasoningContent: '',
          content,
          responseContent: content
        };
      },
      getResponseData: () => ({
        error: undefined,
        reasoningContent: '',
        content: '1: {"tool"}',
        finish_reason: 'tool_calls' as const,
        usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 }
      }),
      updateFinishReason: vi.fn(),
      updateError: vi.fn()
    });
    mockParsePromptToolCall.mockReturnValue({
      answer: '',
      streamAnswer: '',
      toolCalls: []
    });

    const onStreaming = vi.fn();
    const result = await createStreamResponse({
      body: {
        model: 'gpt-4o',
        messages: [],
        stream: true,
        tools: [
          {
            type: 'function',
            function: {
              name: 'search',
              description: 'search',
              parameters: { type: 'object' }
            }
          }
        ],
        toolCallMode: 'prompt'
      },
      response: createMockStreamResponse(chunks),
      onStreaming
    });

    expect(onStreaming).not.toHaveBeenCalled();
    expect(result.toolCalls).toEqual([]);
    expect(result.finish_reason).toBe('tool_calls');
  });

  it('should stream prompt tool text directly when response has no mode prefix', async () => {
    const chunks = [{ choices: [{ delta: { content: 'abc', reasoning_content: 'think' } }] }];
    mockParseLLMStreamResponse.mockReturnValue({
      parsePart: ({ part }: { part: any }) => {
        const content = part.choices?.[0]?.delta?.content || '';
        return {
          reasoningContent: part.choices?.[0]?.delta?.reasoning_content || '',
          content,
          responseContent: content
        };
      },
      getResponseData: () => ({
        error: undefined,
        reasoningContent: 'think',
        content: 'abc',
        finish_reason: 'stop' as const,
        usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 }
      }),
      updateFinishReason: vi.fn(),
      updateError: vi.fn()
    });
    mockParsePromptToolCall.mockReturnValue({
      answer: 'abc',
      streamAnswer: '',
      toolCalls: undefined
    });

    const onReasoning = vi.fn();
    const onStreaming = vi.fn();
    const result = await createStreamResponse({
      body: {
        model: 'gpt-4o',
        messages: [],
        stream: true,
        tools: [
          {
            type: 'function',
            function: {
              name: 'search',
              description: 'search',
              parameters: { type: 'object' }
            }
          }
        ],
        toolCallMode: 'prompt'
      },
      response: createMockStreamResponse(chunks),
      onReasoning,
      onStreaming
    });

    expect(onReasoning).toHaveBeenCalledWith({ text: 'think' });
    expect(onStreaming).toHaveBeenCalledWith({ text: 'abc' });
    expect(result.answerText).toBe('abc');
  });

  it('should keep parser errors on prompt tool stream response', async () => {
    const updateError = vi.fn();
    const parseError = new Error('parse failed');
    mockParseLLMStreamResponse.mockReturnValue({
      parsePart: () => {
        throw parseError;
      },
      getResponseData: () => ({
        error: parseError,
        reasoningContent: '',
        content: '',
        finish_reason: 'error' as const,
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
      }),
      updateFinishReason: vi.fn(),
      updateError
    });
    mockParsePromptToolCall.mockReturnValue({
      answer: '',
      streamAnswer: '',
      toolCalls: undefined
    });

    const result = await createStreamResponse({
      body: {
        model: 'gpt-4o',
        messages: [],
        stream: true,
        tools: [
          {
            type: 'function',
            function: {
              name: 'search',
              description: 'search',
              parameters: { type: 'object' }
            }
          }
        ],
        toolCallMode: 'prompt'
      },
      response: createMockStreamResponse([{ choices: [{ delta: { content: 'abc' } }] }])
    });

    expect(updateError).toHaveBeenCalledWith(parseError);
    expect(result.error).toBe(parseError);
    expect(result.finish_reason).toBe('error');
  });
});
