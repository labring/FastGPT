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
        vectorModel: 'embedding-model',
        vlmModel: 'vlm-model'
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
      args: JSON.stringify({ query: 'origin' }),
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

  it('passes image queries and vlm model to dataset search for image-only search', async () => {
    countPromptTokensMock.mockResolvedValueOnce(0);
    defaultSearchDatasetDataMock.mockResolvedValue({
      searchRes: [],
      embeddingTokens: 0,
      reRankInputTokens: 0,
      usingSimilarityFilter: false,
      usingReRank: false
    });

    const result = await dispatchAgentDatasetSearch({
      args: JSON.stringify({ query: '', imageIds: ['current-0'] }),
      imageUrls: ['https://file.example.com/cat.png'],
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

    expect(defaultSearchDatasetDataMock).toHaveBeenCalledWith(
      expect.objectContaining({
        textQueries: [],
        imageQueries: ['https://file.example.com/cat.png'],
        vlmModel: 'vlm-model'
      })
    );
    expect(result.response).toBe('未找到相关信息。');
    expect(result.nodeResponse).toEqual(
      expect.objectContaining({
        query: '',
        datasetQueries: ['https://file.example.com/cat.png'],
        quoteList: []
      })
    );
  });

  it('keeps text and image queries separated for mixed search', async () => {
    countPromptTokensMock.mockResolvedValueOnce(0);
    defaultSearchDatasetDataMock.mockResolvedValue({
      searchRes: [
        {
          id: 'chunk_1',
          q: 'image question',
          a: 'image answer',
          sourceName: 'image.png',
          score: [{ type: SearchScoreTypeEnum.embedding, value: 0.9, index: 0 }]
        }
      ],
      embeddingTokens: 3,
      reRankInputTokens: 0,
      usingSimilarityFilter: false,
      usingReRank: false
    });

    await dispatchAgentDatasetSearch({
      args: JSON.stringify({ query: '找类似图片', imageIds: ['current-0'] }),
      imageUrls: ['https://file.example.com/cat.png'],
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
        rerankWeight: 0.5
      } as any
    });

    expect(defaultSearchDatasetDataMock).toHaveBeenCalledWith(
      expect.objectContaining({
        textQueries: ['找类似图片'],
        imageQueries: ['https://file.example.com/cat.png']
      })
    );
  });

  it('adds image caption as dataset search child node response', async () => {
    countPromptTokensMock.mockResolvedValueOnce(0);
    defaultSearchDatasetDataMock.mockResolvedValue({
      searchRes: [
        {
          id: 'chunk_1',
          q: 'question 1',
          a: 'answer 1',
          sourceName: 'doc.md',
          score: [{ type: SearchScoreTypeEnum.embedding, value: 0.9, index: 0 }]
        }
      ],
      embeddingTokens: 20,
      reRankInputTokens: 0,
      usingSimilarityFilter: true,
      usingReRank: false,
      imageCaptionResult: {
        model: 'vlm-model',
        inputTokens: 11,
        outputTokens: 4,
        requestIds: ['req_image_caption'],
        seconds: 1.5,
        usedUserOpenAIKey: false,
        queries: ['一只橘猫坐在窗边']
      }
    });

    const result = await dispatchAgentDatasetSearch({
      args: JSON.stringify({ query: '', imageIds: ['current-0'] }),
      imageUrls: ['https://file.example.com/cat.png'],
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
        rerankWeight: 0.5
      } as any
    });

    expect(result.nodeResponse?.childrenResponses).toEqual([
      expect.objectContaining({
        id: 'req_image_caption',
        nodeId: 'req_image_caption',
        moduleType: FlowNodeTypeEnum.datasetSearchNode,
        moduleName: 'account_usage:image_parse',
        moduleLogo: 'core/workflow/template/datasetSearch',
        model: 'vlm-model name',
        llmRequestIds: ['req_image_caption'],
        inputTokens: 11,
        outputTokens: 4,
        totalPoints: 0.15,
        textOutput: '一只橘猫坐在窗边'
      })
    ]);
    expect(result.nodeResponse).toEqual(
      expect.objectContaining({
        childTotalPoints: 0.15
      })
    );
    expect(result.usages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          moduleName: 'account_usage:image_parse',
          totalPoints: 0.15
        })
      ])
    );
  });

  it('sets image caption LLM points to zero when user OpenAI key is valid', async () => {
    countPromptTokensMock.mockResolvedValueOnce(0);
    defaultSearchDatasetDataMock.mockResolvedValue({
      searchRes: [],
      embeddingTokens: 0,
      reRankInputTokens: 0,
      usingSimilarityFilter: false,
      usingReRank: false,
      imageCaptionResult: {
        model: 'vlm-model',
        inputTokens: 11,
        outputTokens: 4,
        requestIds: ['req_image_caption'],
        seconds: 1.5,
        usedUserOpenAIKey: true,
        queries: ['一只橘猫坐在窗边']
      }
    });

    const result = await dispatchAgentDatasetSearch({
      args: JSON.stringify({ query: '', imageIds: ['current-0'] }),
      imageUrls: ['https://file.example.com/cat.png'],
      teamId: 'team_1',
      tmbId: 'tmb_1',
      llmModel: 'gpt-main',
      userKey: { key: 'user-key' } as any,
      datasetParams: {
        datasets: [{ datasetId: 'dataset_1' }],
        similarity: 0.4,
        limit: 5000,
        searchMode: DatasetSearchModeEnum.embedding,
        embeddingWeight: 0.5,
        usingReRank: false,
        rerankWeight: 0.5
      } as any
    });

    expect(result.nodeResponse?.childrenResponses).toEqual([
      expect.objectContaining({
        moduleName: 'account_usage:image_parse',
        totalPoints: 0
      })
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
      args: JSON.stringify({ query: 'origin' }),
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
});
