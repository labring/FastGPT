import {
  ChatCompletionRequestMessageRoleEnum,
  ModelTypeEnum
} from '@fastgpt/global/core/ai/constants';
import type { LLMModelItemType } from '@fastgpt/global/core/ai/model.schema';
import type { ChatCompletionTool } from '@fastgpt/global/core/ai/llm/type';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockCreateLLMResponseQueue, text, toolCall } from './_mocks/llmQueue';

const { createLLMResponseMock, compressRequestMessagesMock, compressToolResponseMock } = vi.hoisted(
  () => ({
    createLLMResponseMock: vi.fn(),
    compressRequestMessagesMock: vi.fn(),
    compressToolResponseMock: vi.fn()
  })
);

vi.mock('@fastgpt/service/core/ai/llm/request', () => ({
  createLLMResponse: createLLMResponseMock
}));

vi.mock('@fastgpt/service/core/ai/model', () => ({
  getLLMModel: vi.fn(
    (): LLMModelItemType => ({
      type: ModelTypeEnum.llm,
      provider: 'openai',
      model: 'gpt-4',
      name: 'GPT-4',
      maxContext: 128000,
      maxResponse: 4096,
      quoteMaxToken: 60000,
      functionCall: true,
      toolChoice: true,
      reasoning: false
    })
  )
}));

vi.mock('@fastgpt/service/core/ai/llm/compress', () => ({
  compressRequestMessages: compressRequestMessagesMock,
  compressToolResponse: compressToolResponseMock
}));

vi.mock('@fastgpt/service/core/ai/llm/utils', () => ({
  filterGPTMessageByMaxContext: vi.fn(async ({ messages }) => messages)
}));

vi.mock('@fastgpt/service/common/string/tiktoken/index', () => ({
  countGptMessagesTokens: vi.fn(async () => 100)
}));

vi.mock('@fastgpt/service/support/wallet/usage/utils', () => ({
  formatModelChars2Points: vi.fn(() => ({
    totalPoints: 1
  }))
}));

import { runAgentLoop } from '@fastgpt/service/core/ai/llm/agentLoop';

const searchTool: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'search',
    description: 'Search test data',
    parameters: {
      type: 'object',
      properties: {
        q: {
          type: 'string'
        }
      },
      required: ['q']
    }
  }
};

describe('runAgentLoop with mocked createLLMResponse', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    compressRequestMessagesMock.mockImplementation(async ({ messages }) => ({
      messages
    }));
    compressToolResponseMock.mockImplementation(async ({ response }) => ({
      compressed: response
    }));
  });

  it('returns after a direct text response', async () => {
    const streamed: string[] = [];
    const usagePush = vi.fn();

    mockCreateLLMResponseQueue(createLLMResponseMock, [
      text({ requestId: 'req_direct', content: 'direct answer', reasoning: 'thinking' })
    ]);

    const result = await runAgentLoop({
      maxRunAgentTimes: 5,
      body: {
        model: 'gpt-4',
        stream: true,
        messages: [
          {
            role: ChatCompletionRequestMessageRoleEnum.User,
            content: 'hello'
          }
        ],
        tools: []
      },
      usagePush,
      isAborted: () => false,
      onRunTool: vi.fn(),
      onRunInteractiveTool: vi.fn(),
      onStreaming: ({ text }) => streamed.push(text)
    });

    expect(createLLMResponseMock).toHaveBeenCalledTimes(1);
    expect(result.requestIds).toEqual(['req_direct']);
    expect(result.finish_reason).toBe('stop');
    expect(result.assistantMessages).toEqual([
      {
        role: 'assistant',
        content: 'direct answer',
        reasoning_content: 'thinking'
      }
    ]);
    expect(streamed).toEqual(['direct answer']);
    expect(usagePush).toHaveBeenCalledWith([
      {
        moduleName: 'account_usage:agent_call',
        model: 'GPT-4',
        totalPoints: 1,
        inputTokens: 100,
        outputTokens: 30
      }
    ]);
  });

  it('returns context checkpoint generated during request message compression', async () => {
    const contextCheckpoint = '<context_checkpoint>compressed history</context_checkpoint>';
    const compressedUsage = {
      moduleName: 'account_usage:compress_llm_messages',
      model: 'GPT-4',
      totalPoints: 0,
      inputTokens: 40,
      outputTokens: 10
    };
    const usagePush = vi.fn();
    const onAfterCompressContext = vi.fn();

    compressRequestMessagesMock.mockImplementation(async ({ messages }) => ({
      messages: [
        {
          role: ChatCompletionRequestMessageRoleEnum.User,
          content: contextCheckpoint,
          hideInUI: true
        },
        ...messages
      ],
      usage: compressedUsage,
      requestIds: ['req_compress'],
      contextCheckpoint
    }));
    mockCreateLLMResponseQueue(createLLMResponseMock, [
      text({ requestId: 'req_direct', content: 'direct answer' })
    ]);

    const result = await runAgentLoop({
      maxRunAgentTimes: 5,
      body: {
        model: 'gpt-4',
        stream: true,
        messages: [
          {
            role: ChatCompletionRequestMessageRoleEnum.User,
            content: 'hello'
          }
        ],
        tools: []
      },
      usagePush,
      isAborted: () => false,
      onRunTool: vi.fn(),
      onRunInteractiveTool: vi.fn(),
      onAfterCompressContext
    });

    expect(result.contextCheckpoint).toEqual(contextCheckpoint);
    expect(onAfterCompressContext).toHaveBeenCalledWith(
      expect.objectContaining({
        usage: compressedUsage,
        requestIds: ['req_compress'],
        contextCheckpoint
      })
    );
    expect(usagePush).toHaveBeenCalledWith([compressedUsage]);
  });

  it('uses request control tool choice while streaming immediately', async () => {
    const streamed: string[] = [];
    const order: string[] = [];
    const requestEvents: Array<Record<string, unknown>> = [];
    const content = 'safe final answer';

    mockCreateLLMResponseQueue(createLLMResponseMock, [text({ requestId: 'req_final', content })]);

    await runAgentLoop({
      maxRunAgentTimes: 5,
      body: {
        model: 'gpt-4',
        stream: true,
        messages: [
          {
            role: ChatCompletionRequestMessageRoleEnum.User,
            content: 'finish with live streaming'
          }
        ],
        tools: [searchTool]
      },
      usagePush: vi.fn(),
      isAborted: () => false,
      onRunTool: vi.fn(),
      onRunInteractiveTool: vi.fn(),
      onStopCandidate: vi.fn(async () => {
        order.push('stop_check');
        expect(streamed.join('')).toBe(content);
        return { allowStop: true };
      }),
      getRequestControl: () => ({
        toolChoice: 'none'
      }),
      onLLMRequestStart: (event) => requestEvents.push({ type: 'start', ...event }),
      onLLMRequestEnd: (event) => requestEvents.push({ type: 'end', ...event }),
      onStreaming: ({ text }) => {
        order.push('stream');
        streamed.push(text);
      }
    });

    expect(streamed).toEqual([content]);
    expect(order).toEqual(['stream', 'stop_check']);
    expect(createLLMResponseMock.mock.calls[0][0].body.tool_choice).toBe('none');
    expect(requestEvents).toEqual([
      expect.objectContaining({
        type: 'start',
        requestIndex: 1,
        modelName: 'GPT-4'
      }),
      expect.objectContaining({
        type: 'end',
        requestIndex: 1,
        modelName: 'GPT-4',
        requestId: 'req_final',
        finishReason: 'stop'
      })
    ]);
  });

  it('executes a tool call and feeds the tool response into the next LLM request', async () => {
    const onRunTool = vi.fn(async () => ({
      response: 'search result',
      assistantMessages: [],
      usages: []
    }));

    mockCreateLLMResponseQueue(createLLMResponseMock, [
      toolCall({
        id: 'call_search',
        name: 'search',
        args: {
          q: 'FastGPT'
        }
      }),
      text({ requestId: 'req_final', content: 'final answer' })
    ]);

    const result = await runAgentLoop({
      maxRunAgentTimes: 5,
      body: {
        model: 'gpt-4',
        stream: true,
        messages: [
          {
            role: ChatCompletionRequestMessageRoleEnum.User,
            content: 'search FastGPT'
          }
        ],
        tools: [searchTool]
      },
      usagePush: vi.fn(),
      isAborted: () => false,
      onRunTool,
      onRunInteractiveTool: vi.fn()
    });

    expect(createLLMResponseMock).toHaveBeenCalledTimes(2);
    expect(onRunTool).toHaveBeenCalledWith({
      call: {
        id: 'call_search',
        type: 'function',
        function: {
          name: 'search',
          arguments: '{"q":"FastGPT"}'
        }
      },
      messages: [
        {
          role: 'user',
          content: 'search FastGPT'
        }
      ]
    });

    const secondLLMCall = createLLMResponseMock.mock.calls[1][0];
    expect(secondLLMCall.body.messages).toContainEqual({
      role: 'tool',
      tool_call_id: 'call_search',
      content: 'search result'
    });
    expect(result.requestIds).toEqual(['req_call_search', 'req_final']);
    expect(result.assistantMessages.at(-1)).toEqual({
      role: 'assistant',
      content: 'final answer'
    });
  });

  it('feeds the compressed tool response into the next LLM request', async () => {
    compressToolResponseMock.mockImplementation(async ({ response }) => ({
      compressed: `compressed:${response}`
    }));
    const onRunTool = vi.fn(async () => ({
      response: 'large search result',
      assistantMessages: [],
      usages: []
    }));

    mockCreateLLMResponseQueue(createLLMResponseMock, [
      toolCall({
        id: 'call_search',
        name: 'search',
        args: {
          q: 'FastGPT'
        }
      }),
      text({ requestId: 'req_final', content: 'final answer' })
    ]);

    const result = await runAgentLoop({
      maxRunAgentTimes: 5,
      body: {
        model: 'gpt-4',
        stream: true,
        messages: [
          {
            role: ChatCompletionRequestMessageRoleEnum.User,
            content: 'search FastGPT'
          }
        ],
        tools: [searchTool]
      },
      usagePush: vi.fn(),
      isAborted: () => false,
      onRunTool,
      onRunInteractiveTool: vi.fn()
    });

    expect(createLLMResponseMock.mock.calls[1][0].body.messages).toContainEqual({
      role: 'tool',
      tool_call_id: 'call_search',
      content: 'compressed:large search result'
    });
    expect(result.assistantMessages).toContainEqual({
      role: 'tool',
      tool_call_id: 'call_search',
      content: 'compressed:large search result'
    });
  });

  it('passes reasoning effort into context and tool response compression', async () => {
    compressRequestMessagesMock.mockImplementation(async ({ messages }) => ({
      messages
    }));
    compressToolResponseMock.mockImplementation(async ({ response }) => ({
      compressed: response
    }));
    const onRunTool = vi.fn(async () => ({
      response: 'tool result',
      assistantMessages: [],
      usages: []
    }));

    mockCreateLLMResponseQueue(createLLMResponseMock, [
      toolCall({
        id: 'call_search',
        name: 'search',
        args: {
          q: 'FastGPT'
        }
      }),
      text({ requestId: 'req_final', content: 'final answer' })
    ]);

    await runAgentLoop({
      maxRunAgentTimes: 5,
      body: {
        model: 'gpt-4',
        reasoning_effort: 'high',
        stream: true,
        messages: [
          {
            role: ChatCompletionRequestMessageRoleEnum.User,
            content: 'search FastGPT'
          }
        ],
        tools: [searchTool]
      },
      usagePush: vi.fn(),
      isAborted: () => false,
      onRunTool,
      onRunInteractiveTool: vi.fn()
    });

    expect(compressRequestMessagesMock.mock.calls[0][0].reasoningEffort).toBe('high');
    expect(compressToolResponseMock.mock.calls[0][0].reasoningEffort).toBe('high');
  });

  it('keeps requestId and usage when LLM returns empty tool_calls finish', async () => {
    const usagePush = vi.fn();
    const onLLMRequestEnd = vi.fn();

    mockCreateLLMResponseQueue(createLLMResponseMock, [
      {
        requestId: 'req_empty_tool_calls',
        finishReason: 'tool_calls',
        responseEmptyTip: 'chat:LLM_model_response_empty',
        inputTokens: 5396,
        outputTokens: 38
      }
    ]);

    const result = await runAgentLoop({
      maxRunAgentTimes: 5,
      body: {
        model: 'gpt-4',
        stream: true,
        messages: [
          {
            role: ChatCompletionRequestMessageRoleEnum.User,
            content: 'call a tool'
          }
        ],
        tools: [searchTool]
      },
      usagePush,
      isAborted: () => false,
      onRunTool: vi.fn(),
      onRunInteractiveTool: vi.fn(),
      onLLMRequestEnd
    });

    expect(result.error).toBe('chat:LLM_model_response_empty');
    expect(result.finish_reason).toBe('tool_calls');
    expect(result.requestIds).toEqual(['req_empty_tool_calls']);
    expect(result.inputTokens).toBe(5396);
    expect(result.outputTokens).toBe(38);
    expect(result.assistantMessages).toEqual([]);
    expect(result.completeMessages).toEqual([
      {
        role: ChatCompletionRequestMessageRoleEnum.User,
        content: 'call a tool'
      }
    ]);
    expect(usagePush).toHaveBeenCalledWith([
      {
        moduleName: 'account_usage:agent_call',
        model: 'GPT-4',
        totalPoints: 1,
        inputTokens: 5396,
        outputTokens: 38
      }
    ]);
    expect(onLLMRequestEnd).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'req_empty_tool_calls',
        finishReason: 'tool_calls',
        error: 'chat:LLM_model_response_empty',
        usage: {
          inputTokens: 5396,
          outputTokens: 38,
          totalPoints: 1
        }
      })
    );
  });

  it('emits tool response compression request ids and running time', async () => {
    vi.useFakeTimers();
    const onAfterToolCall = vi.fn();
    compressToolResponseMock.mockImplementation(async ({ response }) => {
      await vi.advanceTimersByTimeAsync(1234);
      return {
        compressed: `compressed:${response}`,
        usage: {
          moduleName: 'account_usage:tool_response_compress',
          model: 'GPT-4',
          totalPoints: 0.2,
          inputTokens: 40,
          outputTokens: 10
        },
        requestIds: ['req_tool_chunk_1', 'req_tool_chunk_2']
      };
    });
    const onRunTool = vi.fn(async () => ({
      response: 'large search result',
      assistantMessages: [],
      usages: []
    }));

    mockCreateLLMResponseQueue(createLLMResponseMock, [
      toolCall({
        id: 'call_search',
        name: 'search',
        args: {
          q: 'FastGPT'
        }
      }),
      text({ requestId: 'req_final', content: 'final answer' })
    ]);

    try {
      await runAgentLoop({
        maxRunAgentTimes: 5,
        body: {
          model: 'gpt-4',
          stream: true,
          messages: [
            {
              role: ChatCompletionRequestMessageRoleEnum.User,
              content: 'search FastGPT'
            }
          ],
          tools: [searchTool]
        },
        usagePush: vi.fn(),
        isAborted: () => false,
        onRunTool,
        onRunInteractiveTool: vi.fn(),
        onAfterToolCall
      });
    } finally {
      vi.useRealTimers();
    }

    expect(onAfterToolCall).toHaveBeenCalledWith(
      expect.objectContaining({
        response: 'compressed:large search result',
        seconds: 1.23,
        toolResponseCompress: expect.objectContaining({
          requestIds: ['req_tool_chunk_1', 'req_tool_chunk_2'],
          seconds: 1.23
        })
      })
    );
  });

  it('forwards tool call events from createLLMResponse without replaying final tool calls', async () => {
    const onToolCall = vi.fn();
    const weatherCall = {
      id: 'call_weather',
      type: 'function' as const,
      function: {
        name: 'weather',
        arguments: '{"city":"Beijing"}'
      }
    };
    const timeCall = {
      id: 'call_time',
      type: 'function' as const,
      function: {
        name: 'time',
        arguments: '{}'
      }
    };

    mockCreateLLMResponseQueue(createLLMResponseMock, [
      {
        requestId: 'req_parallel_tools',
        finishReason: 'tool_calls',
        toolCalls: [weatherCall, timeCall],
        inputTokens: 100,
        outputTokens: 20
      },
      text({ requestId: 'req_final', content: 'final answer' })
    ]);

    await runAgentLoop({
      maxRunAgentTimes: 5,
      body: {
        model: 'gpt-4',
        stream: true,
        messages: [
          {
            role: ChatCompletionRequestMessageRoleEnum.User,
            content: 'call tools'
          }
        ],
        tools: [searchTool]
      },
      usagePush: vi.fn(),
      isAborted: () => false,
      onRunTool: vi.fn(async ({ call }) => ({
        response: `${call.id} result`,
        assistantMessages: [],
        usages: []
      })),
      onRunInteractiveTool: vi.fn(),
      onToolCall
    });

    expect(onToolCall).toHaveBeenCalledTimes(2);
    expect(onToolCall).toHaveBeenNthCalledWith(1, { call: weatherCall });
    expect(onToolCall).toHaveBeenNthCalledWith(2, { call: timeCall });
  });

  it('runs tools in batches and appends tool messages in model tool call order', async () => {
    const slowCall = {
      id: 'call_slow',
      type: 'function' as const,
      function: {
        name: 'search',
        arguments: '{"q":"slow"}'
      }
    };
    const fastCall = {
      id: 'call_fast',
      type: 'function' as const,
      function: {
        name: 'search',
        arguments: '{"q":"fast"}'
      }
    };

    mockCreateLLMResponseQueue(createLLMResponseMock, [
      {
        requestId: 'req_parallel_tools',
        finishReason: 'tool_calls',
        toolCalls: [slowCall, fastCall],
        inputTokens: 100,
        outputTokens: 20
      },
      text({ requestId: 'req_final', content: 'final answer' })
    ]);

    const result = await runAgentLoop({
      maxRunAgentTimes: 5,
      batchToolSize: 2,
      body: {
        model: 'gpt-4',
        stream: true,
        messages: [
          {
            role: ChatCompletionRequestMessageRoleEnum.User,
            content: 'call tools'
          }
        ],
        tools: [searchTool]
      },
      usagePush: vi.fn(),
      isAborted: () => false,
      onRunTool: vi.fn(async ({ call }) => {
        await new Promise((resolve) => setTimeout(resolve, call.id === 'call_slow' ? 20 : 0));

        return {
          response: `${call.id} result`,
          assistantMessages: [],
          usages: []
        };
      }),
      onRunInteractiveTool: vi.fn()
    });

    expect(result.completeMessages.filter((message) => message.role === 'tool')).toEqual([
      {
        role: 'tool',
        tool_call_id: 'call_slow',
        content: 'call_slow result'
      },
      {
        role: 'tool',
        tool_call_id: 'call_fast',
        content: 'call_fast result'
      }
    ]);
  });

  it('stops the loop when a tool handler returns stop=true', async () => {
    const onRunTool = vi.fn(async () => ({
      response: 'handled and stop',
      assistantMessages: [],
      usages: [],
      stop: true
    }));

    mockCreateLLMResponseQueue(createLLMResponseMock, [
      toolCall({
        id: 'call_search',
        name: 'search',
        args: {
          q: 'FastGPT'
        }
      }),
      text({ requestId: 'req_should_not_be_used', content: 'unused' })
    ]);

    const result = await runAgentLoop({
      maxRunAgentTimes: 5,
      body: {
        model: 'gpt-4',
        stream: true,
        messages: [
          {
            role: ChatCompletionRequestMessageRoleEnum.User,
            content: 'search FastGPT'
          }
        ],
        tools: [searchTool]
      },
      usagePush: vi.fn(),
      isAborted: () => false,
      onRunTool,
      onRunInteractiveTool: vi.fn()
    });

    expect(createLLMResponseMock).toHaveBeenCalledTimes(1);
    expect(result.requestIds).toEqual(['req_call_search']);
    expect(result.assistantMessages).toContainEqual({
      role: 'tool',
      tool_call_id: 'call_search',
      content: 'handled and stop'
    });
  });

  it('treats tool handler exceptions as tool responses and continues', async () => {
    const onAfterToolCall = vi.fn();

    mockCreateLLMResponseQueue(createLLMResponseMock, [
      toolCall({
        id: 'call_search',
        name: 'search',
        args: {
          q: 'FastGPT'
        }
      }),
      text({ requestId: 'req_final', content: 'final answer' })
    ]);

    const result = await runAgentLoop({
      maxRunAgentTimes: 5,
      body: {
        model: 'gpt-4',
        stream: true,
        messages: [
          {
            role: ChatCompletionRequestMessageRoleEnum.User,
            content: 'search FastGPT'
          }
        ],
        tools: [searchTool]
      },
      usagePush: vi.fn(),
      isAborted: () => false,
      onRunTool: vi.fn(async () => {
        throw new Error('network failed');
      }),
      onRunInteractiveTool: vi.fn(),
      onAfterToolCall
    });

    expect(createLLMResponseMock).toHaveBeenCalledTimes(2);
    expect(onAfterToolCall).toHaveBeenCalledWith(
      expect.objectContaining({
        call: expect.objectContaining({ id: 'call_search' }),
        response: 'Tool error: network failed',
        errorMessage: 'Tool error: network failed'
      })
    );
    expect(createLLMResponseMock.mock.calls[1][0].body.messages).toContainEqual({
      role: 'tool',
      tool_call_id: 'call_search',
      content: 'Tool error: network failed'
    });
    expect(result.assistantMessages).toContainEqual({
      role: 'tool',
      tool_call_id: 'call_search',
      content: 'Tool error: network failed'
    });
  });

  it('continues the same loop when stop candidate returns feedback', async () => {
    const streamed: string[] = [];
    const onStopCandidate = vi
      .fn()
      .mockResolvedValueOnce({
        allowStop: false,
        feedbackMessage: {
          role: ChatCompletionRequestMessageRoleEnum.User,
          content: 'Plan is not complete. Continue.'
        }
      })
      .mockResolvedValueOnce({
        allowStop: true
      });

    mockCreateLLMResponseQueue(createLLMResponseMock, [
      text({ requestId: 'req_too_early', content: 'done too early' }),
      text({ requestId: 'req_final', content: 'final answer' })
    ]);

    const result = await runAgentLoop({
      maxRunAgentTimes: 5,
      body: {
        model: 'gpt-4',
        stream: true,
        messages: [
          {
            role: ChatCompletionRequestMessageRoleEnum.User,
            content: 'finish plan'
          }
        ],
        tools: []
      },
      usagePush: vi.fn(),
      isAborted: () => false,
      onRunTool: vi.fn(),
      onRunInteractiveTool: vi.fn(),
      onStopCandidate,
      onStreaming: ({ text }) => streamed.push(text)
    });

    expect(createLLMResponseMock).toHaveBeenCalledTimes(2);
    expect(onStopCandidate).toHaveBeenCalledTimes(2);
    expect(createLLMResponseMock.mock.calls[1][0].body.messages).toContainEqual({
      role: 'user',
      content: 'Plan is not complete. Continue.'
    });
    expect(result.requestIds).toEqual(['req_too_early', 'req_final']);
    expect(result.assistantMessages).toEqual([
      {
        role: 'assistant',
        content: 'final answer'
      }
    ]);
    expect(streamed).toEqual(['done too early', 'final answer']);
  });
});
