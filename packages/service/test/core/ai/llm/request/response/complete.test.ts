import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { removeDatasetCiteText } from '@fastgpt/global/core/ai/llm/utils';
import { getLLMModel } from '@fastgpt/service/core/ai/model';
import { parsePromptToolCall } from '@fastgpt/service/core/ai/llm/promptCall';
import { parseReasoningContent } from '@fastgpt/service/core/ai/utils';
import { createCompleteResponse } from '@fastgpt/service/core/ai/llm/request/response/complete';

vi.mock('@fastgpt/global/core/ai/llm/utils', () => ({
  removeDatasetCiteText: vi.fn((text: string) => text)
}));

vi.mock('@fastgpt/service/core/ai/model', () => ({
  getLLMModel: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/llm/promptCall', () => ({
  parsePromptToolCall: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/utils', () => ({
  parseReasoningContent: vi.fn()
}));

const mockRemoveDatasetCiteText = vi.mocked(removeDatasetCiteText);
const mockGetLLMModel = vi.mocked(getLLMModel);
const mockParsePromptToolCall = vi.mocked(parsePromptToolCall);
const mockParseReasoningContent = vi.mocked(parseReasoningContent);

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
    mockGetLLMModel.mockReturnValue(createModel());
  });

  it('should parse non-stream text response and emit streaming callback', async () => {
    let streamedText = '';
    const result = await createCompleteResponse({
      body: {
        model: 'gpt-4o',
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
    mockGetLLMModel.mockReturnValue(createModel({ reasoning: true }));

    let reasoningText = '';
    let answerText = '';
    const result = await createCompleteResponse({
      body: {
        model: 'gpt-4o',
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
    mockGetLLMModel.mockReturnValue(createModel({ reasoning: true }));
    mockParseReasoningContent.mockReturnValue(['hidden reasoning', 'visible answer']);

    const result = await createCompleteResponse({
      body: {
        model: 'gpt-4o',
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
        model: 'gpt-4o',
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
        model: 'gpt-4o',
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
