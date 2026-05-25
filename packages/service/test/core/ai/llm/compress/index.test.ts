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
    expect(compressPrompt).not.toContain('最近消息预览');
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
    countPromptTokensMock.mockResolvedValue(1000);
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

    expect(result).toEqual({
      compressed: 'compressed chunk',
      usage: {
        moduleName: 'account_usage:llm_compress_text',
        model: 'GPT-4',
        totalPoints: 3,
        inputTokens: 20,
        outputTokens: 5
      },
      requestIds: ['req_chunk']
    });
    expect(createLLMResponseMock).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          stream: false,
          temperature: 0.1
        })
      })
    );
    const compressPrompt = createLLMResponseMock.mock.calls[0][0].body.messages[0].content;
    const userPrompt = createLLMResponseMock.mock.calls[0][0].body.messages[1].content;
    expect(compressPrompt).not.toContain('tokens');
    expect(compressPrompt).not.toContain('targetTokens');
    expect(compressPrompt).not.toContain('压缩到约');
    expect(compressPrompt).not.toContain('large content that requires LLM compression');
    expect(userPrompt).toContain('<content>');
    expect(userPrompt).toContain('large content that requires LLM compression');
    expect(userPrompt).toContain('</content>');
  });

  it('should pass reasoning effort to large content compression requests', async () => {
    countPromptTokensMock.mockResolvedValue(1000);
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
    countPromptTokensMock.mockResolvedValue(1000);
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
    countPromptTokensMock.mockResolvedValue(1000);
    countGptMessagesTokensMock.mockResolvedValueOnce(999).mockResolvedValueOnce(1000);
    createLLMResponseMock.mockResolvedValue({
      answerText: 'x'.repeat(100),
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

    expect(result.compressed).toContain('... [content truncated] ...');
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
    countPromptTokensMock.mockResolvedValue(1000);
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

  it('should use dynamic available context as the tool compressed token limit', async () => {
    countPromptTokensMock.mockResolvedValue(1600);
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
});
