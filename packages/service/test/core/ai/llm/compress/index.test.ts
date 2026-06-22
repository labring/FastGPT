import {
  ChatCompletionRequestMessageRoleEnum,
  ModelTypeEnum
} from '@fastgpt/global/core/ai/constants';
import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/llm/type';
import type { LLMModelItemType } from '@fastgpt/global/core/ai/model.schema';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createLLMResponseMock,
  countGptMessagesTokensMock,
  countPromptTokensMock,
  formatModelChars2PointsMock
} = vi.hoisted(() => ({
  createLLMResponseMock: vi.fn(),
  countGptMessagesTokensMock: vi.fn(),
  countPromptTokensMock: vi.fn(),
  formatModelChars2PointsMock: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/llm/request', () => ({
  createLLMResponse: createLLMResponseMock
}));

vi.mock('@fastgpt/service/common/string/tiktoken', () => ({
  countGptMessagesTokens: countGptMessagesTokensMock,
  countPromptTokens: countPromptTokensMock
}));

vi.mock('@fastgpt/service/common/string/tiktoken/index', () => ({
  countGptMessagesTokens: countGptMessagesTokensMock,
  countPromptTokens: countPromptTokensMock
}));

vi.mock('@fastgpt/service/support/wallet/usage/utils', () => ({
  formatModelChars2Points: formatModelChars2PointsMock
}));

import {
  compressLargeContent,
  compressRequestMessages,
  compressToolResponse
} from '@fastgpt/service/core/ai/llm/compress';
import { extractExactAnchors } from '@fastgpt/service/core/ai/llm/compress/prompt';

const model: LLMModelItemType = {
  type: ModelTypeEnum.llm,
  provider: 'openai',
  model: 'gpt-4',
  name: 'GPT-4',
  maxContext: 4000,
  maxResponse: 1024,
  quoteMaxToken: 2000,
  functionCall: true,
  toolChoice: true,
  reasoning: false
};

const createMessages = (): ChatCompletionMessageParam[] => [
  {
    role: ChatCompletionRequestMessageRoleEnum.System,
    content: 'system prompt'
  },
  {
    dataId: 'history-user-1',
    role: ChatCompletionRequestMessageRoleEnum.User,
    content: 'old user 1'
  },
  {
    dataId: 'history-ai-1',
    role: ChatCompletionRequestMessageRoleEnum.Assistant,
    content: 'old assistant 1'
  },
  {
    dataId: 'history-user-2',
    role: ChatCompletionRequestMessageRoleEnum.User,
    content: 'old user 2'
  },
  {
    dataId: 'history-ai-2',
    role: ChatCompletionRequestMessageRoleEnum.Assistant,
    content: 'old assistant 2'
  },
  {
    dataId: 'history-user-3',
    role: ChatCompletionRequestMessageRoleEnum.User,
    content: 'recent user 3'
  }
];

const mockDefaultUsagePoints = () => {
  formatModelChars2PointsMock.mockReturnValue({
    totalPoints: 3
  });
};

const mockPromptTokensForLlmCompression = ({
  cleanedTokens = 1000,
  finalTokens = 50,
  initialTokens = 1000
}: {
  cleanedTokens?: number;
  finalTokens?: number;
  initialTokens?: number;
} = {}) => {
  countPromptTokensMock
    .mockResolvedValueOnce(initialTokens)
    .mockResolvedValueOnce(cleanedTokens)
    .mockResolvedValueOnce(cleanedTokens)
    .mockResolvedValueOnce(finalTokens)
    .mockResolvedValue(initialTokens);
};

describe('compressRequestMessages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDefaultUsagePoints();
    countPromptTokensMock.mockResolvedValue(100);
    countGptMessagesTokensMock.mockImplementation(
      async ({ messages }: { messages: ChatCompletionMessageParam[] }) => messages.length * 1000
    );
  });

  it('should compress all non-system messages into one hidden context checkpoint', async () => {
    createLLMResponseMock.mockResolvedValue({
      answerText: '# Context Checkpoint\nold task summary',
      usage: {
        inputTokens: 120,
        outputTokens: 30
      },
      requestId: 'req_compress',
      finish_reason: 'stop'
    });

    const messages = createMessages();
    const result = await compressRequestMessages({
      messages,
      model
    });

    expect(createLLMResponseMock).toHaveBeenCalledTimes(1);
    expect(result.messages).toEqual([
      {
        role: ChatCompletionRequestMessageRoleEnum.System,
        content: 'system prompt'
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.User,
        content:
          '<context_checkpoint>\n# Context Checkpoint\nold task summary\n</context_checkpoint>',
        hideInUI: true
      }
    ]);
    expect(result.contextCheckpoint).toBe(
      '<context_checkpoint>\n# Context Checkpoint\nold task summary\n</context_checkpoint>'
    );
    expect(result.usage).toEqual({
      moduleName: 'account_usage:compress_llm_messages',
      model: 'GPT-4',
      totalPoints: 3,
      inputTokens: 120,
      outputTokens: 30
    });
    expect(result.requestIds).toEqual(['req_compress']);

    const [systemPromptMessage, userPromptMessage] =
      createLLMResponseMock.mock.calls[0][0].body.messages;
    const compressPrompt = systemPromptMessage.content;
    const userPrompt = userPromptMessage.content;
    expect(compressPrompt).not.toContain('目标长度');
    expect(compressPrompt).not.toContain('targetTokens');
    expect(compressPrompt).not.toContain('recent user 3');
    expect(userPrompt).toContain('<histories>');
    expect(userPrompt).toContain('recent user 3');
    expect(userPrompt).toContain('<output_budget>');
    expect(compressPrompt).not.toContain('最近消息预览');
    expect(createLLMResponseMock.mock.calls[0][0].body.max_tokens).toBeUndefined();
  });

  it('should pass reasoning effort to the checkpoint compression LLM request', async () => {
    createLLMResponseMock.mockResolvedValue({
      answerText: '<context_checkpoint>\nsummary\n</context_checkpoint>',
      usage: {
        inputTokens: 120,
        outputTokens: 30
      },
      requestId: 'req_reasoning_compress',
      finish_reason: 'stop'
    });

    await compressRequestMessages({
      messages: createMessages(),
      model,
      reasoningEffort: 'none'
    });

    expect(createLLMResponseMock.mock.calls[0][0].body.reasoning_effort).toBe('none');
  });

  it('should preserve developer messages with system messages', async () => {
    createLLMResponseMock.mockResolvedValue({
      answerText: '<context_checkpoint>\nsummary\n</context_checkpoint>',
      usage: {
        inputTokens: 10,
        outputTokens: 5
      },
      requestId: 'req_developer',
      finish_reason: 'stop'
    });

    const developerMessage: ChatCompletionMessageParam = {
      role: ChatCompletionRequestMessageRoleEnum.Developer,
      content: 'developer prompt'
    };
    const baseMessages = createMessages();
    const messages = [baseMessages[0], developerMessage, ...baseMessages.slice(1)];
    const result = await compressRequestMessages({
      messages,
      model
    });

    expect(result.messages.slice(0, 2)).toEqual([baseMessages[0], developerMessage]);
  });

  it('should normalize tagged checkpoint content from fenced or explained LLM output', async () => {
    createLLMResponseMock.mockResolvedValue({
      answerText:
        '额外说明\n```markdown\n<context_checkpoint>\nkeep only this\n</context_checkpoint>\n```\n尾部说明',
      usage: {
        inputTokens: 30,
        outputTokens: 10
      },
      requestId: 'req_tagged',
      finish_reason: 'stop'
    });

    const result = await compressRequestMessages({
      messages: createMessages(),
      model
    });

    expect(result.contextCheckpoint).toBe(
      '<context_checkpoint>\nkeep only this\n</context_checkpoint>'
    );
  });

  it('should not replace an over-target LLM checkpoint when final messages stay within the production threshold', async () => {
    countGptMessagesTokensMock.mockResolvedValueOnce(5000).mockResolvedValueOnce(2800);
    createLLMResponseMock.mockResolvedValue({
      answerText:
        '<context_checkpoint>\n# Context Checkpoint\n## User Goal\n保留完整语义摘要，而不是首尾截断。\n</context_checkpoint>',
      usage: {
        inputTokens: 500,
        outputTokens: 3000
      },
      requestId: 'req_soft_budget',
      finish_reason: 'stop'
    });

    const result = await compressRequestMessages({
      messages: createMessages(),
      model
    });

    expect(result.contextCheckpoint).toContain('保留完整语义摘要');
    expect(result.contextCheckpoint).not.toContain('## Source History Excerpts');
    expect(createLLMResponseMock.mock.calls[0][0].body.max_tokens).toBeUndefined();
  });

  it('should use deterministic fallback only when the final compressed messages fit the threshold', async () => {
    countGptMessagesTokensMock
      .mockResolvedValueOnce(5000)
      .mockResolvedValueOnce(4500)
      .mockResolvedValueOnce(1200)
      .mockResolvedValueOnce(3000)
      .mockResolvedValueOnce(2600);
    createLLMResponseMock.mockResolvedValue({
      answerText: '<context_checkpoint>\n超长 LLM checkpoint\n</context_checkpoint>',
      usage: {
        inputTokens: 500,
        outputTokens: 3000
      },
      requestId: 'req_deterministic_budget',
      finish_reason: 'stop'
    });

    const messages = createMessages();
    const result = await compressRequestMessages({
      messages,
      model
    });

    expect(result.contextCheckpoint).toContain('## Source History Excerpts');
    expect(result.messages).not.toBe(messages);
    expect(countGptMessagesTokensMock).toHaveBeenNthCalledWith(3, {
      messages: [messages[0]]
    });
  });

  it('should return original messages when compressed checkpoint still exceeds the production threshold', async () => {
    countGptMessagesTokensMock
      .mockResolvedValueOnce(5000)
      .mockResolvedValueOnce(4500)
      .mockResolvedValueOnce(4500)
      .mockResolvedValueOnce(1200);
    createLLMResponseMock.mockResolvedValue({
      answerText: '<context_checkpoint>\n超长 tool checkpoint\n</context_checkpoint>',
      usage: {
        inputTokens: 500,
        outputTokens: 3000
      },
      requestId: 'req_over_budget_tool_history',
      finish_reason: 'stop'
    });
    const messages: ChatCompletionMessageParam[] = [
      {
        role: ChatCompletionRequestMessageRoleEnum.System,
        content: 'system prompt'
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.User,
        content: 'Run search_orders.'
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: null,
        tool_calls: [
          {
            id: 'call_search_orders',
            type: 'function',
            function: {
              name: 'search_orders',
              arguments: '{"customerId":"c_123"}'
            }
          }
        ]
      }
    ];

    const result = await compressRequestMessages({
      messages,
      model
    });

    expect(result.messages).toBe(messages);
    expect(result.contextCheckpoint).toBeUndefined();
    expect(result.requestIds).toEqual(['req_over_budget_tool_history']);
  });

  it('should keep original messages when below compression threshold', async () => {
    countGptMessagesTokensMock.mockResolvedValue(100);

    const messages = createMessages();
    const result = await compressRequestMessages({
      messages,
      model
    });

    expect(result).toEqual({ messages });
    expect(createLLMResponseMock).not.toHaveBeenCalled();
  });

  it('should build a local structured checkpoint for over-threshold tool-call histories', async () => {
    countGptMessagesTokensMock.mockResolvedValueOnce(5000).mockResolvedValueOnce(1200);
    const messages: ChatCompletionMessageParam[] = [
      {
        role: ChatCompletionRequestMessageRoleEnum.System,
        content: 'system prompt'
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.User,
        content:
          'Case alpha. Available tools: [{"type":"function","function":{"name":"search_orders","parameters":{"properties":{"customerId":{"type":"string"}}}}}]'
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.User,
        content: 'Find recent orders for customer c_123.'
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: null,
        tool_calls: [
          {
            id: 'call_search_orders',
            type: 'function',
            function: {
              name: 'search_orders',
              arguments: '{"customerId":"c_123","limit":5}'
            }
          }
        ]
      }
    ];

    const result = await compressRequestMessages({
      messages,
      model
    });

    expect(createLLMResponseMock).not.toHaveBeenCalled();
    expect(result.usage).toBeUndefined();
    expect(result.messages).toEqual([
      messages[0],
      {
        role: ChatCompletionRequestMessageRoleEnum.User,
        content: result.contextCheckpoint,
        hideInUI: true
      }
    ]);
    expect(result.contextCheckpoint).toContain('<context_checkpoint>');
    expect(result.contextCheckpoint).toContain('Case alpha. Available tools:');
    expect(result.contextCheckpoint).toContain('search_orders');
    expect(result.contextCheckpoint).toContain('"customerId":"c_123"');
    expect(result.contextCheckpoint).toContain('Find recent orders for customer c_123');
  });

  it('should count system messages before accepting a local structured checkpoint', async () => {
    countGptMessagesTokensMock
      .mockResolvedValueOnce(5000)
      .mockResolvedValueOnce(4800)
      .mockResolvedValueOnce(260);
    createLLMResponseMock.mockResolvedValue({
      answerText: '<context_checkpoint>\nllm fallback summary\n</context_checkpoint>',
      usage: {
        inputTokens: 50,
        outputTokens: 10
      },
      requestId: 'req_structured_with_system_budget',
      finish_reason: 'stop'
    });
    const messages: ChatCompletionMessageParam[] = [
      {
        role: ChatCompletionRequestMessageRoleEnum.System,
        content: 'very long system prompt'
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.User,
        content:
          'Available tools: [{"type":"function","function":{"name":"search_orders","parameters":{"properties":{"customerId":{"type":"string"}}}}}]'
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: null,
        tool_calls: [
          {
            id: 'call_search_orders',
            type: 'function',
            function: {
              name: 'search_orders',
              arguments: '{"customerId":"c_123"}'
            }
          }
        ]
      }
    ];

    const result = await compressRequestMessages({
      messages,
      model
    });

    expect(createLLMResponseMock).toHaveBeenCalled();
    expect(result.contextCheckpoint).toContain('llm fallback summary');
  });

  it('should include generic tool call memory in checkpoint compression prompt', async () => {
    countGptMessagesTokensMock
      .mockResolvedValueOnce(5000)
      .mockResolvedValueOnce(5000)
      .mockResolvedValueOnce(2000);
    createLLMResponseMock.mockResolvedValue({
      answerText: '<context_checkpoint>\ntool summary\n</context_checkpoint>',
      usage: {
        inputTokens: 50,
        outputTokens: 10
      },
      requestId: 'req_tool_memory',
      finish_reason: 'stop'
    });
    const messages: ChatCompletionMessageParam[] = [
      {
        role: ChatCompletionRequestMessageRoleEnum.System,
        content: 'system prompt'
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.User,
        content: 'Search enterprise contracts signed by Acme in 2025.'
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: null,
        tool_calls: [
          {
            id: 'call_search_contracts',
            type: 'function',
            function: {
              name: 'search_contracts',
              arguments: '{"company":"Acme","year":2025}'
            }
          }
        ]
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Tool,
        tool_call_id: 'call_search_contracts',
        content: '{"contracts":[{"id":"ctr_2025_001","amount":1200000}]}'
      }
    ];

    const result = await compressRequestMessages({
      messages,
      model
    });

    expect(createLLMResponseMock).toHaveBeenCalledTimes(1);
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0]).toBe(messages[0]);
    expect(result.contextCheckpoint).toBe(
      '<context_checkpoint>\ntool summary\n</context_checkpoint>'
    );
    const userPrompt = createLLMResponseMock.mock.calls[0][0].body.messages[1].content;
    expect(userPrompt).toContain('<tool_call_memory>');
    expect(userPrompt).toContain('fn=search_contracts');
    expect(userPrompt).toContain('args={"company":"Acme","year":2025}');
    expect(userPrompt).toContain('user=Search enterprise contracts');
    expect(userPrompt).toContain('"id":"ctr_2025_001"');
  });

  it('should use the full request context to decide checkpoint compression', async () => {
    createLLMResponseMock.mockResolvedValue({
      answerText: '<context_checkpoint>\nshort user summary\n</context_checkpoint>',
      usage: {
        inputTokens: 20,
        outputTokens: 5
      },
      requestId: 'req_full_context_threshold',
      finish_reason: 'stop'
    });
    const messages: ChatCompletionMessageParam[] = [
      {
        role: ChatCompletionRequestMessageRoleEnum.System,
        content: 'very long system prompt'
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Developer,
        content: 'very long developer prompt'
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.User,
        content: 'short user history'
      }
    ];
    countGptMessagesTokensMock.mockImplementation(
      async (input: { messages: ChatCompletionMessageParam[] }) =>
        input.messages === messages ? 4000 : 100
    );

    const result = await compressRequestMessages({
      messages,
      model
    });

    expect(createLLMResponseMock).toHaveBeenCalledTimes(1);
    expect(countGptMessagesTokensMock).toHaveBeenCalledWith({
      messages
    });
    expect(result.messages).toEqual([
      messages[0],
      messages[1],
      {
        role: ChatCompletionRequestMessageRoleEnum.User,
        content: '<context_checkpoint>\nshort user summary\n</context_checkpoint>',
        hideInUI: true
      }
    ]);
    const userPrompt = createLLMResponseMock.mock.calls[0][0].body.messages[1].content;
    expect(userPrompt).toContain('short user history');
    expect(userPrompt).not.toContain('very long system prompt');
    expect(userPrompt).not.toContain('very long developer prompt');
  });

  it('should return original messages and usage when compressor returns empty content', async () => {
    createLLMResponseMock.mockResolvedValue({
      answerText: '',
      usage: {
        inputTokens: 50,
        outputTokens: 0
      },
      requestId: 'req_empty',
      finish_reason: 'stop'
    });

    const messages = createMessages();
    const result = await compressRequestMessages({
      messages,
      model
    });

    expect(result.messages).toBe(messages);
    expect(result.contextCheckpoint).toBeUndefined();
    expect(result.requestIds).toEqual(['req_empty']);
    expect(result.usage).toMatchObject({
      moduleName: 'account_usage:compress_llm_messages',
      inputTokens: 50,
      outputTokens: 0
    });
  });

  it('should return original messages with usage when compression is aborted', async () => {
    createLLMResponseMock.mockResolvedValue({
      answerText: '<context_checkpoint>\nsummary\n</context_checkpoint>',
      usage: {
        inputTokens: 50,
        outputTokens: 10,
        usedUserOpenAIKey: false
      },
      requestId: 'req_abort',
      finish_reason: 'close'
    });

    const messages = createMessages();
    const result = await compressRequestMessages({
      messages,
      model
    });

    expect(result.messages).toBe(messages);
    expect(result.contextCheckpoint).toBeUndefined();
    expect(result.requestIds).toEqual(['req_abort']);
    expect(result.usage).toMatchObject({
      totalPoints: 3,
      inputTokens: 50,
      outputTokens: 10
    });
  });

  it('should skip billing points when valid userKey is provided', async () => {
    createLLMResponseMock.mockResolvedValue({
      answerText: '<context_checkpoint>\nsummary\n</context_checkpoint>',
      usage: {
        inputTokens: 50,
        outputTokens: 10,
        usedUserOpenAIKey: true
      },
      requestId: 'req_user_key',
      finish_reason: 'stop'
    });

    const result = await compressRequestMessages({
      messages: createMessages(),
      model,
      userKey: {
        key: 'user-key',
        baseUrl: 'https://user.example.com/v1'
      }
    });

    expect(result.usage?.totalPoints).toBe(0);
    expect(formatModelChars2PointsMock).not.toHaveBeenCalled();
  });

  it('should not skip billing points when userKey has no key', async () => {
    createLLMResponseMock.mockResolvedValue({
      answerText: '<context_checkpoint>\nsummary\n</context_checkpoint>',
      usage: {
        inputTokens: 50,
        outputTokens: 10
      },
      requestId: 'req_user_base_url_only',
      finish_reason: 'stop'
    });

    const result = await compressRequestMessages({
      messages: createMessages(),
      model,
      userKey: {
        baseUrl: 'https://user.example.com/v1'
      } as any
    });

    expect(result.usage?.totalPoints).toBe(3);
    expect(formatModelChars2PointsMock).toHaveBeenCalled();
  });

  it('should return original messages when compressor throws', async () => {
    createLLMResponseMock.mockRejectedValue(new Error('network error'));

    const messages = createMessages();
    const result = await compressRequestMessages({
      messages,
      model
    });

    expect(result).toEqual({ messages });
  });
});

describe('compressLargeContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDefaultUsagePoints();
    countGptMessagesTokensMock.mockResolvedValue(50);
  });

  it('should return original content when it is already under the compressed token limit', async () => {
    countPromptTokensMock.mockResolvedValue(10);

    const result = await compressLargeContent({
      content: 'short content',
      model,
      compressedTokenLimit: 100
    });

    expect(result).toEqual({ compressed: 'short content' });
    expect(createLLMResponseMock).not.toHaveBeenCalled();
  });

  it('should return rule-cleaned content when urls and base64 cleanup is enough', async () => {
    countPromptTokensMock.mockResolvedValueOnce(1000).mockResolvedValueOnce(10);

    const result = await compressLargeContent({
      content: `visit https://example.com/a/b and payload ${'a'.repeat(120)} done`,
      model,
      compressedTokenLimit: 100
    });

    expect(result.compressed).toBe('visit  and payload [BASE64_DATA] done');
    expect(createLLMResponseMock).not.toHaveBeenCalled();
  });

  it('should run all rule cleanups before LLM compression', async () => {
    countPromptTokensMock
      .mockResolvedValueOnce(1000)
      .mockResolvedValueOnce(900)
      .mockResolvedValueOnce(10);

    const result = await compressLargeContent({
      content:
        '![diagram](/tmp/image.png)\n\n\nfile /tmp/project/report.txt id 550e8400-e29b-41d4-a716-446655440000 at 2024-01-01T12:30:00Z',
      model,
      compressedTokenLimit: 100
    });

    expect(result.compressed).toBe('[diagram]\n\nfile report.txt id at');
    expect(createLLMResponseMock).not.toHaveBeenCalled();
  });

  it('should use LLM chunk compression when rule cleanup is not enough', async () => {
    mockPromptTokensForLlmCompression();
    countGptMessagesTokensMock.mockResolvedValue(50);
    createLLMResponseMock.mockResolvedValue({
      answerText: ' compressed chunk ',
      usage: {
        inputTokens: 20,
        outputTokens: 5,
        usedUserOpenAIKey: false
      },
      requestId: 'req_chunk'
    });

    const result = await compressLargeContent({
      content: 'large content that requires LLM compression',
      model,
      compressedTokenLimit: 100
    });

    expect(result).toMatchObject({
      usage: {
        moduleName: 'account_usage:llm_compress_text',
        model: 'GPT-4',
        totalPoints: 3,
        inputTokens: 20,
        outputTokens: 5
      },
      requestIds: ['req_chunk']
    });
    expect(result.compressed).toBe('compressed chunk');
    expect(createLLMResponseMock).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          stream: false
        })
      })
    );
    expect(createLLMResponseMock.mock.calls[0][0].body).not.toHaveProperty('temperature');
    const compressPrompt = createLLMResponseMock.mock.calls[0][0].body.messages[0].content;
    const userPrompt = createLLMResponseMock.mock.calls[0][0].body.messages[1].content;
    expect(compressPrompt).not.toContain('tokens');
    expect(compressPrompt).not.toContain('targetTokens');
    expect(compressPrompt).not.toContain('压缩到约');
    expect(compressPrompt).not.toContain('large content that requires LLM compression');
    expect(userPrompt).toContain('<content>');
    expect(userPrompt).toContain('large content that requires LLM compression');
    expect(userPrompt).toContain('</content>');
    expect(userPrompt).toContain('<output_budget>');
    expect(userPrompt).toContain('Target maximum output tokens: 65');
    expect(createLLMResponseMock.mock.calls[0][0].body.max_tokens).toBeUndefined();
  });

  it('should pass reasoning effort to large content compression requests', async () => {
    mockPromptTokensForLlmCompression();
    countGptMessagesTokensMock.mockResolvedValue(50);
    createLLMResponseMock.mockResolvedValue({
      answerText: 'compressed',
      usage: {
        inputTokens: 20,
        outputTokens: 5,
        usedUserOpenAIKey: true
      },
      requestId: 'req_large_reasoning'
    });

    await compressLargeContent({
      content: 'large content',
      model,
      compressedTokenLimit: 100,
      reasoningEffort: 'low'
    });

    expect(createLLMResponseMock.mock.calls[0][0].body.reasoning_effort).toBe('low');
  });

  it('should keep original chunk text when LLM returns empty chunk content', async () => {
    mockPromptTokensForLlmCompression();
    countGptMessagesTokensMock.mockResolvedValue(50);
    createLLMResponseMock.mockResolvedValue({
      answerText: '',
      usage: {
        inputTokens: 20,
        outputTokens: 0
      },
      requestId: 'req_empty_chunk'
    });

    const content = 'large content that cannot be summarized';
    const result = await compressLargeContent({
      content,
      model,
      compressedTokenLimit: 100
    });

    expect(result.compressed).toBe(content);
    expect(result.requestIds).toEqual(['req_empty_chunk']);
  });

  it('should truncate merged LLM output when it still exceeds the compressed token limit', async () => {
    countPromptTokensMock
      .mockResolvedValueOnce(1000)
      .mockResolvedValueOnce(1000)
      .mockResolvedValueOnce(1000)
      .mockResolvedValueOnce(999)
      .mockResolvedValueOnce(1000)
      .mockResolvedValueOnce(999)
      .mockResolvedValueOnce(999)
      .mockResolvedValueOnce(50);
    createLLMResponseMock.mockResolvedValue({
      answerText: 'x'.repeat(1000),
      usage: {
        inputTokens: 20,
        outputTokens: 200
      },
      requestId: 'req_truncate'
    });

    const result = await compressLargeContent({
      content: 'large content',
      model,
      compressedTokenLimit: 100
    });

    expect(result.compressed.length).toBeLessThan(1000);
    expect(result.compressed.length).toBeGreaterThan(0);
  });

  it('should keep LLM merge output when tokens are within budget even if char length barely changes', async () => {
    countPromptTokensMock
      .mockResolvedValueOnce(1000)
      .mockResolvedValueOnce(1000)
      .mockResolvedValueOnce(1000)
      .mockResolvedValueOnce(999)
      .mockResolvedValueOnce(1000)
      .mockResolvedValueOnce(80)
      .mockResolvedValueOnce(80)
      .mockResolvedValueOnce(80);
    createLLMResponseMock
      .mockResolvedValueOnce({
        answerText: 'x'.repeat(1000),
        usage: {
          inputTokens: 20,
          outputTokens: 200
        },
        requestId: 'req_initial_long'
      })
      .mockResolvedValueOnce({
        answerText: 'y'.repeat(980),
        usage: {
          inputTokens: 20,
          outputTokens: 80
        },
        requestId: 'req_merge_within_budget'
      });

    const result = await compressLargeContent({
      content: 'large content',
      model,
      compressedTokenLimit: 100
    });

    expect(result.compressed).toBe('y'.repeat(980));
    expect(result.compressed).not.toContain('content truncated');
  });

  it('should append source excerpts when LLM output uses too little of the budget', async () => {
    countPromptTokensMock
      .mockResolvedValueOnce(2000)
      .mockResolvedValueOnce(2000)
      .mockResolvedValueOnce(2000)
      .mockResolvedValueOnce(100)
      .mockResolvedValueOnce(2000)
      .mockResolvedValueOnce(100)
      .mockResolvedValueOnce(700)
      .mockResolvedValue(700);
    createLLMResponseMock.mockResolvedValue({
      answerText: '简短摘要',
      usage: {
        inputTokens: 20,
        outputTokens: 20
      },
      requestId: 'req_short_summary'
    });

    const result = await compressLargeContent({
      content: ['开头字段：关键背景', '正文内容。'.repeat(400), '尾部字段：最终结论'].join('\n'),
      model,
      compressedTokenLimit: 1000
    });

    expect(result.compressed).toContain('简短摘要');
    expect(result.compressed).toContain('Source excerpts for exact labels and facts');
    expect(result.compressed).toContain('尾部字段');
  });

  it('should append exact source anchors while staying within the token budget', async () => {
    countPromptTokensMock
      .mockResolvedValueOnce(2000)
      .mockResolvedValueOnce(2000)
      .mockResolvedValueOnce(2000)
      .mockResolvedValueOnce(500)
      .mockResolvedValueOnce(2000)
      .mockResolvedValueOnce(500)
      .mockResolvedValueOnce(540)
      .mockResolvedValueOnce(580)
      .mockResolvedValueOnce(600);
    createLLMResponseMock.mockResolvedValue({
      answerText: '压缩后的核心事实',
      usage: {
        inputTokens: 20,
        outputTokens: 20
      },
      requestId: 'req_anchor_append'
    });

    const result = await compressLargeContent({
      content: ['问题标题：关键问题', '字段名称：重要字段', '正文内容。'.repeat(400)].join('\n'),
      model,
      compressedTokenLimit: 1000
    });

    expect(result.compressed).toContain('压缩后的核心事实');
    expect(result.compressed).toContain('Source labels / exact anchors');
    expect(result.compressed).toContain('问题标题');
    expect(result.compressed).toContain('字段名称');
  });

  it('should skip source anchors when compressed output already uses most of the budget', async () => {
    countPromptTokensMock
      .mockResolvedValueOnce(2000)
      .mockResolvedValueOnce(2000)
      .mockResolvedValueOnce(2000)
      .mockResolvedValueOnce(810)
      .mockResolvedValueOnce(2000)
      .mockResolvedValueOnce(810)
      .mockResolvedValueOnce(810);
    createLLMResponseMock.mockResolvedValue({
      answerText: '压缩后的核心事实',
      usage: {
        inputTokens: 20,
        outputTokens: 20
      },
      requestId: 'req_anchor_skip'
    });

    const result = await compressLargeContent({
      content: ['问题标题：关键问题', '字段名称：重要字段', '正文内容。'.repeat(400)].join('\n'),
      model,
      compressedTokenLimit: 1000
    });

    expect(result.compressed).toBe('压缩后的核心事实');
    expect(result.compressed).not.toContain('Source labels / exact anchors');
  });

  it('should append at most twelve source anchors', async () => {
    countPromptTokensMock
      .mockResolvedValueOnce(2000)
      .mockResolvedValueOnce(2000)
      .mockResolvedValueOnce(2000)
      .mockResolvedValueOnce(500)
      .mockResolvedValueOnce(2000)
      .mockResolvedValueOnce(500)
      .mockResolvedValue(520);
    createLLMResponseMock.mockResolvedValue({
      answerText: '压缩后的核心事实',
      usage: {
        inputTokens: 20,
        outputTokens: 20
      },
      requestId: 'req_anchor_cap'
    });

    const result = await compressLargeContent({
      content: [
        ...Array.from({ length: 20 }, (_, index) => `字段${index + 1}：值${index + 1}`),
        '正文内容。'.repeat(400)
      ].join('\n'),
      model,
      compressedTokenLimit: 1000
    });

    const appendedAnchorCount =
      result.compressed
        .split('Source labels / exact anchors:')[1]
        ?.split('\n')
        .filter((line) => line.trim().startsWith('- ')).length ?? 0;

    expect(appendedAnchorCount).toBeLessThanOrEqual(12);
  });

  it('should return cleaned content when LLM chunk compression throws', async () => {
    countPromptTokensMock.mockResolvedValue(1000);
    createLLMResponseMock.mockRejectedValue(new Error('llm unavailable'));

    const result = await compressLargeContent({
      content: 'large   content\n\n\nwith spaces',
      model,
      compressedTokenLimit: 100
    });

    expect(result).toEqual({
      compressed: 'large content\n\nwith spaces'
    });
  });

  it('should skip billing points for chunk compression when valid userKey is provided', async () => {
    mockPromptTokensForLlmCompression();
    countGptMessagesTokensMock.mockResolvedValue(50);
    createLLMResponseMock.mockResolvedValue({
      answerText: 'compressed',
      usage: {
        inputTokens: 20,
        outputTokens: 5,
        usedUserOpenAIKey: true
      },
      requestId: 'req_user_key_chunk'
    });

    const result = await compressLargeContent({
      content: 'large content',
      model,
      compressedTokenLimit: 100,
      userKey: {
        key: 'user-key',
        baseUrl: 'https://user.example.com/v1'
      }
    });

    expect(result.usage?.totalPoints).toBe(0);
    expect(formatModelChars2PointsMock).not.toHaveBeenCalled();
  });
});

describe('extractExactAnchors', () => {
  it('should extract only generic structural anchors instead of ordinary keywords', () => {
    const anchors = extractExactAnchors(
      [
        'The ordinary project background should not become an anchor.',
        'tool_name: search_contracts',
        'trace_id: req_2025_001',
        '问题标题：如何处理长文本压缩',
        '## Release Notes',
        '1.2 处理流程',
        '请参考【结论摘要】继续执行。',
        'Use /tmp/project/report.txt on 2025-01-02.',
        'statusCode: 429'
      ].join('\n'),
      20
    );

    expect(anchors).toEqual(
      expect.arrayContaining([
        'tool_name',
        'trace_id',
        '问题标题',
        'Release Notes',
        '处理流程',
        '结论摘要',
        'req_2025_001',
        '2025-01-02',
        '429'
      ])
    );
    expect(anchors).not.toEqual(expect.arrayContaining(['ordinary', 'project', 'background']));
  });
});

describe('compressToolResponse', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDefaultUsagePoints();
    countGptMessagesTokensMock.mockResolvedValue(50);
  });

  it('should return empty response directly', async () => {
    const result = await compressToolResponse({
      response: '',
      model
    });

    expect(result).toEqual({ compressed: '' });
    expect(countPromptTokensMock).not.toHaveBeenCalled();
    expect(createLLMResponseMock).not.toHaveBeenCalled();
  });

  it('should minify JSON tool responses without LLM when minified content fits the budget', async () => {
    countPromptTokensMock.mockResolvedValue(100);
    const response = JSON.stringify(
      {
        source: 'tool_call_log',
        rows: [
          {
            id: 'multiple_001',
            messages: [
              {
                role: 'user',
                content: 'Find lawsuits filed against Google in California in 2020.'
              },
              {
                role: 'assistant',
                content: null,
                tool_calls: [
                  {
                    type: 'function',
                    function: {
                      name: 'lawsuits_search',
                      arguments: '{"company_name":"Google","location":"California","year":2020}'
                    }
                  }
                ]
              }
            ],
            tools: [
              {
                type: 'function',
                function: {
                  name: 'lawsuits_search',
                  description: 'Long description should be removed from compressed tool schema.',
                  parameters: {
                    type: 'object',
                    required: ['company_name', 'location', 'year'],
                    properties: {
                      company_name: {
                        type: 'string',
                        description: 'Company name.'
                      },
                      location: {
                        type: 'string',
                        description: 'Location.'
                      },
                      year: {
                        type: 'integer',
                        description: 'Year.'
                      }
                    }
                  }
                }
              }
            ]
          }
        ]
      },
      null,
      2
    );

    const result = await compressToolResponse({
      response,
      model,
      compressedTokenLimit: 1200,
      currentMessagesTokens: 0,
      toolLength: 1
    });

    expect(createLLMResponseMock).not.toHaveBeenCalled();
    const compressed = JSON.parse(result.compressed);
    expect(compressed.source).toBe('tool_call_log');
    expect(result.compressed).toContain('rows');
    expect(result.compressed).toContain('lawsuits_search');
    expect(result.compressed).toContain('company_name');
    expect(result.compressed).toContain('California');
    expect(result.compressed).toContain('Long description');
    expect(result.compressed).not.toContain('\n');
  });

  it('should summarize larger JSON tool responses structurally without LLM', async () => {
    countPromptTokensMock.mockResolvedValueOnce(900).mockResolvedValueOnce(180);
    const response = JSON.stringify({
      source: 'tool_call_log',
      rows: [
        {
          id: 'multiple_001',
          messages: [
            {
              role: 'user',
              content: 'Find lawsuits filed against Google in California in 2020.'
            }
          ],
          tools: [
            {
              type: 'function',
              function: {
                name: 'lawsuits_search',
                parameters: {
                  type: 'object',
                  required: ['company_name', 'location', 'year']
                }
              }
            }
          ]
        },
        {
          id: 'multiple_002',
          messages: [],
          tools: []
        }
      ]
    });

    const result = await compressToolResponse({
      response,
      model,
      compressedTokenLimit: 1200,
      currentMessagesTokens: 0,
      toolLength: 1
    });

    expect(createLLMResponseMock).not.toHaveBeenCalled();
    expect(result.compressed).toContain('JSON structural summary');
    expect(result.compressed).toContain('root keys: source, rows');
    expect(result.compressed).toContain('important scalar values: tool_call_log; multiple_001');
    expect(result.compressed).toContain('rows: array(length=2)');
    expect(result.compressed).toContain('rows[0].id: multiple_001');
    expect(result.compressed).toContain('rows[0].tools[0].function.name: lawsuits_search');
    expect(result.compressed).not.toContain('{"source"');
  });

  it('should use dynamic available context as the tool compressed token limit', async () => {
    mockPromptTokensForLlmCompression({
      cleanedTokens: 1600,
      initialTokens: 1600
    });
    createLLMResponseMock.mockResolvedValue({
      answerText: 'compressed tool response',
      usage: {
        inputTokens: 30,
        outputTokens: 6
      },
      requestId: 'req_tool'
    });

    const result = await compressToolResponse({
      response: 'tool response',
      model,
      currentMessagesTokens: 1000,
      toolLength: 2,
      reasoningEffort: 'high'
    });

    expect(createLLMResponseMock).toHaveBeenCalledTimes(1);
    expect(result.compressed).toBe('compressed tool response');
    expect(result.usage?.moduleName).toBe('account_usage:tool_response_compress');
    expect(result.requestIds).toEqual(['req_tool']);
    expect(createLLMResponseMock.mock.calls[0][0].body.reasoning_effort).toBe('high');
  });

  it('should respect caller provided compressed token limit for tool response', async () => {
    mockPromptTokensForLlmCompression({
      cleanedTokens: 1200,
      initialTokens: 1200
    });
    createLLMResponseMock.mockResolvedValue({
      answerText: 'budgeted tool response',
      usage: {
        inputTokens: 30,
        outputTokens: 6
      },
      requestId: 'req_tool_budget'
    });

    const result = await compressToolResponse({
      response: 'tool response',
      model,
      compressedTokenLimit: 1000,
      currentMessagesTokens: 0,
      toolLength: 1
    });

    expect(createLLMResponseMock).toHaveBeenCalledTimes(1);
    expect(result.compressed).toBe('budgeted tool response');
    expect(createLLMResponseMock.mock.calls[0][0].body.max_tokens).toBeUndefined();
  });
});
