import {
  ChatCompletionRequestMessageRoleEnum,
  ModelTypeEnum
} from '@fastgpt/global/core/ai/constants';
import type { LLMModelItemType } from '@fastgpt/global/core/ai/model.schema';
import type { ChatCompletionTool } from '@fastgpt/global/core/ai/llm/type';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockCreateLLMResponseQueue, text, toolCall } from './_mocks/llmQueue';

const { createLLMResponseMock } = vi.hoisted(() => ({
  createLLMResponseMock: vi.fn()
}));

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
  compressRequestMessages: vi.fn(async ({ messages }) => ({
    messages
  })),
  compressToolResponse: vi.fn(async ({ response }) => ({
    compressed: response
  }))
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

vi.mock('@fastgpt/web/i18n/utils', () => ({
  i18nT: vi.fn((key: string) => key)
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

  it('replays deferred final streaming in paced chunks after stop is accepted', async () => {
    const streamed: string[] = [];
    const content = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

    mockCreateLLMResponseQueue(createLLMResponseMock, [text({ requestId: 'req_final', content })]);

    await runAgentLoop({
      maxRunAgentTimes: 5,
      body: {
        model: 'gpt-4',
        stream: true,
        messages: [
          {
            role: ChatCompletionRequestMessageRoleEnum.User,
            content: 'finish with delayed streaming'
          }
        ],
        tools: []
      },
      usagePush: vi.fn(),
      isAborted: () => false,
      onRunTool: vi.fn(),
      onRunInteractiveTool: vi.fn(),
      onStopCandidate: vi.fn(async () => ({ allowStop: true })),
      deferStreamingUntilStopCandidate: true,
      onStreaming: ({ text }) => streamed.push(text)
    });

    expect(streamed.length).toBeGreaterThan(1);
    expect(streamed.join('')).toBe(content);
  });

  it('streams immediately when request control marks the final answer as safe', async () => {
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
      deferStreamingUntilStopCandidate: true,
      getRequestControl: () => ({
        deferStreamingUntilStopCandidate: false,
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
      deferStreamingUntilStopCandidate: true,
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
    expect(streamed).toEqual(['final answer']);
  });
});
