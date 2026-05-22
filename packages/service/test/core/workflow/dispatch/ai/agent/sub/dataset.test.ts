import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DatasetSearchModeEnum, SearchScoreTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

const {
  countPromptTokensMock,
  createLLMResponseMock,
  defaultSearchDatasetDataMock,
  findDatasetByIdMock,
  formatModelChars2PointsMock
} = vi.hoisted(() => ({
  countPromptTokensMock: vi.fn(),
  createLLMResponseMock: vi.fn(),
  defaultSearchDatasetDataMock: vi.fn(),
  findDatasetByIdMock: vi.fn(),
  formatModelChars2PointsMock: vi.fn()
}));

vi.mock('@fastgpt/service/core/dataset/search', () => ({
  defaultSearchDatasetData: defaultSearchDatasetDataMock
}));

vi.mock('@fastgpt/service/core/dataset/schema', () => ({
  MongoDataset: {
    findById: findDatasetByIdMock
  }
}));

vi.mock('@fastgpt/service/core/ai/model', () => ({
  getEmbeddingModel: vi.fn(() => ({
    model: 'embedding-model',
    name: 'Embedding Model'
  })),
  getLLMModel: vi.fn((model: string) => ({
    model,
    name: `${model} name`,
    maxContext: 1000
  })),
  getRerankModel: vi.fn(() => undefined)
}));

vi.mock('@fastgpt/service/core/ai/llm/request', () => ({
  createLLMResponse: createLLMResponseMock
}));

vi.mock('@fastgpt/service/common/string/tiktoken/index', () => ({
  countPromptTokens: countPromptTokensMock
}));

vi.mock('@fastgpt/service/core/ai/llm/compress/constants', () => ({
  calculateCompressionThresholds: vi.fn(() => ({
    datasetSearchSelection: 1
  }))
}));

vi.mock('@fastgpt/service/support/wallet/usage/utils', () => ({
  formatModelChars2Points: formatModelChars2PointsMock
}));

import { dispatchAgentDatasetSearch } from '../../../../../../../core/workflow/dispatch/ai/agent/sub/dataset';

describe('dispatchAgentDatasetSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findDatasetByIdMock.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        vectorModel: 'embedding-model'
      })
    });
    countPromptTokensMock.mockResolvedValue(100);
    createLLMResponseMock.mockResolvedValue({
      answerText: '[chunk_2]',
      requestId: 'req_chunk_selection',
      usage: {
        inputTokens: 7,
        outputTokens: 2,
        usedUserOpenAIKey: false
      }
    });
    formatModelChars2PointsMock.mockImplementation(
      ({
        model,
        inputTokens = 0,
        outputTokens = 0
      }: {
        model?: string;
        inputTokens?: number;
        outputTokens?: number;
      }) => ({
        modelName: `${model || 'unknown'} name`,
        totalPoints: (inputTokens + outputTokens) / 100
      })
    );
  });

  it('adds query extension and chunk selection as dataset search child node responses', async () => {
    defaultSearchDatasetDataMock.mockResolvedValue({
      searchRes: [
        {
          id: 'chunk_1',
          q: 'question 1',
          a: 'answer 1',
          sourceName: 'doc.md',
          score: [{ type: SearchScoreTypeEnum.embedding, value: 0.9, index: 0 }]
        },
        {
          id: 'chunk_2',
          q: 'question 2',
          a: 'answer 2',
          sourceName: 'doc.md',
          score: [{ type: SearchScoreTypeEnum.embedding, value: 0.8, index: 1 }]
        }
      ],
      embeddingTokens: 20,
      reRankInputTokens: 0,
      usingSimilarityFilter: true,
      usingReRank: false,
      queryExtensionResult: {
        llmModel: 'gpt-query',
        requestId: 'req_query_extension',
        seconds: 1.2,
        inputTokens: 10,
        outputTokens: 5,
        usedUserOpenAIKey: false,
        embeddingModel: 'embedding-query',
        embeddingTokens: 6,
        query: 'origin\nexpanded'
      }
    });

    const result = await dispatchAgentDatasetSearch({
      args: JSON.stringify({ query: ['origin'] }),
      teamId: 'team_1',
      tmbId: 'tmb_1',
      llmModel: 'gpt-main',
      datasetParams: {
        datasets: [{ datasetId: 'dataset_1' }],
        similarity: 0.4,
        limit: 5000,
        searchMode: DatasetSearchModeEnum.embedding,
        embeddingWeight: 0.5,
        usingReRank: false,
        rerankWeight: 0.5,
        datasetSearchUsingExtensionQuery: true
      } as any
    });

    expect(result.nodeResponse).not.toHaveProperty('llmRequestIds');
    expect(result.nodeResponse).not.toHaveProperty('queryExtensionResult');
    expect(result.nodeResponse).not.toHaveProperty('query');
    expect(result.nodeResponse?.datasetQueries).toEqual(['origin']);
    expect(defaultSearchDatasetDataMock).toHaveBeenCalledWith(
      expect.objectContaining({
        textQueries: ['origin']
      })
    );
    expect(result.nodeResponse?.childrenResponses).toEqual([
      expect.objectContaining({
        id: 'req_query_extension',
        nodeId: 'req_query_extension',
        moduleType: FlowNodeTypeEnum.datasetSearchNode,
        moduleName: 'common:core.module.template.Query extension',
        moduleLogo: 'core/workflow/template/datasetSearch',
        runningTime: 1.2,
        model: 'gpt-query name',
        llmRequestIds: ['req_query_extension'],
        inputTokens: 10,
        outputTokens: 5,
        totalPoints: 0.15,
        textOutput: 'origin\nexpanded'
      }),
      expect.objectContaining({
        id: 'req_chunk_selection',
        nodeId: 'req_chunk_selection',
        moduleType: FlowNodeTypeEnum.datasetSearchNode,
        moduleName: 'account_usage:dataset_chunk_selection',
        moduleLogo: 'core/workflow/template/datasetSearch',
        model: 'gpt-main name',
        llmRequestIds: ['req_chunk_selection'],
        inputTokens: 7,
        outputTokens: 2,
        totalPoints: 0.09,
        textOutput: 'chunk_2'
      })
    ]);
    expect(result.usages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          moduleName: 'common:core.module.template.Query extension',
          totalPoints: 0.15
        }),
        expect.objectContaining({
          moduleName: 'account_usage:dataset_chunk_selection',
          totalPoints: 0.09
        })
      ])
    );
    expect(result.nodeResponse?.quoteList?.map((item: { id: string }) => item.id)).toEqual([
      'chunk_2'
    ]);
  });

  it('sets query extension and chunk selection LLM points to zero when user OpenAI key is valid', async () => {
    defaultSearchDatasetDataMock.mockResolvedValue({
      searchRes: [
        {
          id: 'chunk_1',
          q: 'question 1',
          a: 'answer 1',
          sourceName: 'doc.md',
          score: [{ type: SearchScoreTypeEnum.embedding, value: 0.9, index: 0 }]
        },
        {
          id: 'chunk_2',
          q: 'question 2',
          a: 'answer 2',
          sourceName: 'doc.md',
          score: [{ type: SearchScoreTypeEnum.embedding, value: 0.8, index: 1 }]
        }
      ],
      embeddingTokens: 20,
      reRankInputTokens: 0,
      usingSimilarityFilter: true,
      usingReRank: false,
      queryExtensionResult: {
        llmModel: 'gpt-query',
        requestId: 'req_query_extension',
        seconds: 1.2,
        inputTokens: 10,
        outputTokens: 5,
        usedUserOpenAIKey: true,
        embeddingModel: 'embedding-query',
        embeddingTokens: 6,
        query: 'origin\nexpanded'
      }
    });

    const userKey = {
      key: 'user-key'
    } as any;
    createLLMResponseMock.mockResolvedValueOnce({
      answerText: '[chunk_2]',
      requestId: 'req_chunk_selection',
      usage: {
        inputTokens: 7,
        outputTokens: 2,
        usedUserOpenAIKey: true
      }
    });

    const result = await dispatchAgentDatasetSearch({
      args: JSON.stringify({ query: ['origin'] }),
      teamId: 'team_1',
      tmbId: 'tmb_1',
      llmModel: 'gpt-main',
      userKey,
      datasetParams: {
        datasets: [{ datasetId: 'dataset_1' }],
        similarity: 0.4,
        limit: 5000,
        searchMode: DatasetSearchModeEnum.embedding,
        embeddingWeight: 0.5,
        usingReRank: false,
        rerankWeight: 0.5,
        datasetSearchUsingExtensionQuery: true
      } as any
    });

    expect(defaultSearchDatasetDataMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userKey
      })
    );
    expect(createLLMResponseMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userKey
      })
    );
    expect(result.nodeResponse?.childrenResponses).toEqual([
      expect.objectContaining({
        moduleName: 'common:core.module.template.Query extension',
        totalPoints: 0
      }),
      expect.objectContaining({
        moduleName: 'account_usage:dataset_chunk_selection',
        totalPoints: 0
      })
    ]);
    expect(result.usages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          moduleName: 'common:core.module.template.Query extension',
          totalPoints: 0
        }),
        expect.objectContaining({
          moduleName: 'account_usage:dataset_chunk_selection',
          totalPoints: 0
        }),
        expect.objectContaining({
          moduleName: 'account_usage:ai.query_extension_embedding',
          totalPoints: 0.06
        })
      ])
    );
  });

  it('keeps compatibility with legacy string query params', async () => {
    defaultSearchDatasetDataMock.mockResolvedValue({
      searchRes: [],
      embeddingTokens: 0,
      reRankInputTokens: 0,
      usingSimilarityFilter: true,
      usingReRank: false
    });

    const result = await dispatchAgentDatasetSearch({
      args: JSON.stringify({ query: 'legacy query' }),
      teamId: 'team_1',
      tmbId: 'tmb_1',
      llmModel: 'gpt-main',
      datasetParams: {
        datasets: [{ datasetId: 'dataset_1' }],
        searchMode: DatasetSearchModeEnum.embedding
      } as any
    });

    expect(defaultSearchDatasetDataMock).toHaveBeenCalledWith(
      expect.objectContaining({
        textQueries: ['legacy query']
      })
    );
    expect(result.nodeResponse?.datasetQueries).toEqual(['legacy query']);
  });
});
