import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createLLMResponseMock, filterGPTMessageByMaxContextMock, lazyGreedyQuerySelectionMock } =
  vi.hoisted(() => ({
    createLLMResponseMock: vi.fn(),
    filterGPTMessageByMaxContextMock: vi.fn(),
    lazyGreedyQuerySelectionMock: vi.fn()
  }));

vi.mock('@fastgpt/service/core/ai/llm/request', () => ({
  createLLMResponse: createLLMResponseMock
}));

vi.mock('@fastgpt/service/core/ai/llm/utils', () => ({
  filterGPTMessageByMaxContext: filterGPTMessageByMaxContextMock
}));

vi.mock('@fastgpt/service/core/ai/hooks/useTextCosine', () => ({
  useTextCosine: vi.fn(() => ({
    embeddingModel: 'embedding-query',
    lazyGreedyQuerySelection: lazyGreedyQuerySelectionMock
  }))
}));

import { queryExtension } from '../../../../core/ai/functions/queryExtension';
import type {
  EmbeddingSystemModelDataType,
  LLMSystemModelDataType
} from '@fastgpt/global/core/ai/model.schema';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';

const llmModel = {
  modelId: '507f1f77bcf86cd799439014',
  provider: 'openai',
  model: 'gpt-query',
  name: 'GPT Query',
  type: ModelTypeEnum.llm,
  isSystem: true,
  isActive: true,
  isCustom: false,
  config: {
    maxContext: 4000,
    maxResponse: 1000,
    quoteMaxToken: 2000,
    reasoning: true
  }
} satisfies LLMSystemModelDataType;
const embeddingModel = {
  modelId: '507f1f77bcf86cd799439015',
  provider: 'openai',
  model: 'embedding-query',
  name: 'Embedding Query',
  type: ModelTypeEnum.embedding,
  isSystem: true,
  isActive: true,
  isCustom: false,
  config: {
    defaultToken: 512,
    maxToken: 8192,
    weight: 0
  }
} satisfies EmbeddingSystemModelDataType;

describe('queryExtension', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    filterGPTMessageByMaxContextMock.mockResolvedValue([]);
    lazyGreedyQuerySelectionMock.mockResolvedValue({
      selectedData: ['expanded query'],
      embeddingTokens: 6
    });
  });

  it('disables reasoning when the query extension model supports it', async () => {
    createLLMResponseMock.mockResolvedValue({
      answerText: '[]',
      requestId: 'req_query_extension_reasoning',
      usage: {
        inputTokens: 11,
        outputTokens: 3,
        usedUserOpenAIKey: false
      }
    });

    await queryExtension({
      query: 'original query',
      histories: [],
      llmModel,
      embeddingModel,
      teamId: 'team_1'
    });

    expect(createLLMResponseMock.mock.calls[0][0].body.reasoning_effort).toBe('none');
  });

  it('does not send reasoning effort when the query extension model does not support it', async () => {
    createLLMResponseMock.mockResolvedValue({
      answerText: '[]',
      requestId: 'req_query_extension_without_reasoning',
      usage: {
        inputTokens: 11,
        outputTokens: 3,
        usedUserOpenAIKey: false
      }
    });

    await queryExtension({
      query: 'original query',
      histories: [],
      llmModel: { ...llmModel, config: { ...llmModel.config, reasoning: false } },
      embeddingModel,
      teamId: 'team_1'
    });

    expect(createLLMResponseMock.mock.calls[0][0].body).not.toHaveProperty('reasoning_effort');
  });

  it('returns LLM request id for node response tracing', async () => {
    createLLMResponseMock.mockResolvedValue({
      answerText: '["expanded query"]',
      requestId: 'req_query_extension',
      usage: {
        inputTokens: 11,
        outputTokens: 3,
        usedUserOpenAIKey: false
      }
    });

    const result = await queryExtension({
      query: 'original query',
      histories: [],
      llmModel,
      embeddingModel,
      teamId: 'team_1'
    });

    expect(result).toEqual({
      rawQuery: 'original query',
      extensionQueries: ['expanded query'],
      llmModel: llmModel.model,
      embeddingModel: embeddingModel.model,
      requestId: 'req_query_extension',
      seconds: expect.any(Number),
      inputTokens: 11,
      outputTokens: 3,
      usedUserOpenAIKey: false,
      embeddingTokens: 6
    });
  });

  it('filters blank generated queries before cosine selection', async () => {
    createLLMResponseMock.mockResolvedValue({
      answerText: '["  ", " expanded query ", ""]',
      requestId: 'req_query_extension_filter',
      usage: {
        inputTokens: 11,
        outputTokens: 3,
        usedUserOpenAIKey: false
      }
    });

    await queryExtension({
      query: 'original query',
      histories: [],
      llmModel,
      embeddingModel,
      teamId: 'team_1'
    });

    expect(lazyGreedyQuerySelectionMock).toHaveBeenCalledWith({
      originalText: 'original query',
      candidates: ['expanded query'],
      k: 1,
      alpha: 0.3
    });
  });

  it('does not run cosine selection when generated queries are all blank', async () => {
    createLLMResponseMock.mockResolvedValue({
      answerText: '["  ", ""]',
      requestId: 'req_query_extension_blank',
      usage: {
        inputTokens: 11,
        outputTokens: 3,
        usedUserOpenAIKey: false
      }
    });

    const result = await queryExtension({
      query: 'original query',
      histories: [],
      llmModel,
      embeddingModel,
      teamId: 'team_1'
    });

    expect(lazyGreedyQuerySelectionMock).not.toHaveBeenCalled();
    expect(result.extensionQueries).toEqual([]);
    expect(result.embeddingTokens).toBe(0);
  });

  it('splits fixed system prompt and dynamic user prompt', async () => {
    filterGPTMessageByMaxContextMock.mockResolvedValue([
      {
        role: 'user',
        content: '产品 A 有哪些优势？'
      },
      {
        role: 'assistant',
        content: '1. 开源\n2. 简便\n3. 扩展性强'
      }
    ]);
    createLLMResponseMock.mockResolvedValue({
      answerText: '["权限资源接入测试问题 42"]',
      requestId: 'req_query_extension_prompt',
      usage: {
        inputTokens: 12,
        outputTokens: 4,
        usedUserOpenAIKey: false
      }
    });

    await queryExtension({
      chatBg: '当前对话围绕产品 A。唯一背景 42。',
      query: '权限资源接入测试问题 42',
      histories: [],
      llmModel,
      embeddingModel,
      teamId: 'team_1',
      generateCount: 4
    });

    const messages = createLLMResponseMock.mock.calls[0][0].body.messages;
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({
      role: 'system'
    });
    expect(messages[1]).toMatchObject({
      role: 'user'
    });
    expect(messages[0].content).toContain('你是一个面向知识库检索的查询改写器');
    expect(messages[0].content).not.toContain('权限资源接入测试问题 42');
    expect(messages[0].content).not.toContain('唯一背景 42');
    expect(messages[1].content).toContain('期望数量：4');
    expect(messages[1].content).toContain('当前对话围绕产品 A。唯一背景 42。');
    expect(messages[1].content).toContain('user: 产品 A 有哪些优势？');
    expect(messages[1].content).toContain('assistant: 1. 开源\n2. 简便\n3. 扩展性强');
    expect(messages[1].content).toContain('权限资源接入测试问题 42');
  });
});
