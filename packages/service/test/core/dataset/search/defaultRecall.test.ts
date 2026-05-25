import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constants';
import { serviceEnv } from '@fastgpt/service/env';

const mockGetVectors = vi.hoisted(() => vi.fn());
const mockGetEmbeddingModel = vi.hoisted(() => vi.fn());
const mockGetDefaultRerankModel = vi.hoisted(() => vi.fn());
const mockGetLLMModel = vi.hoisted(() => vi.fn());
const mockIsImageEmbeddingModel = vi.hoisted(() => vi.fn());
const mockRecallFromVectorStore = vi.hoisted(() => vi.fn());
const mockCreateLLMResponse = vi.hoisted(() => vi.fn());
const mockMongoDatasetCollectionFind = vi.hoisted(() => vi.fn());
const mockMongoDatasetDataFind = vi.hoisted(() => vi.fn());
const mockMongoDatasetDataTextAggregate = vi.hoisted(() => vi.fn());
const mockGetImageBase64 = vi.hoisted(() => vi.fn());
const mockCountPromptTokensBatch = vi.hoisted(() =>
  vi.fn(async (prompts: string[]) => prompts.map((prompt) => prompt.length))
);

const originalMultipleDataToBase64 = serviceEnv.MULTIPLE_DATA_TO_BASE64;

vi.mock('@fastgpt/service/core/ai/embedding', () => ({
  getVectors: mockGetVectors
}));

vi.mock('@fastgpt/service/core/ai/model', () => ({
  getEmbeddingModel: mockGetEmbeddingModel,
  getDefaultRerankModel: mockGetDefaultRerankModel,
  getLLMModel: mockGetLLMModel,
  isImageEmbeddingModel: mockIsImageEmbeddingModel
}));

vi.mock('@fastgpt/service/common/vectorDB/controller', () => ({
  recallFromVectorStore: mockRecallFromVectorStore
}));

vi.mock('@fastgpt/service/core/ai/llm/request', () => ({
  createLLMResponse: mockCreateLLMResponse
}));

vi.mock('@fastgpt/service/common/file/image/utils', () => ({
  getImageBase64: mockGetImageBase64
}));

// defaultRecall 的结果过滤只关心 token 数的相对大小，测试里用稳定 mock
// 隔离真实 worker 路径，避免单元测试依赖 app/pro 的 worker 构建产物。
vi.mock('@fastgpt/service/common/string/tiktoken/index', () => ({
  countPromptTokensBatch: mockCountPromptTokensBatch
}));

vi.mock('@fastgpt/service/core/dataset/collection/schema', () => ({
  DatasetColCollectionName: 'dataset_collections',
  MongoDatasetCollection: {
    find: mockMongoDatasetCollectionFind
  }
}));

vi.mock('@fastgpt/service/core/dataset/data/schema', () => ({
  DatasetDataCollectionName: 'dataset_datas',
  MongoDatasetData: {
    find: mockMongoDatasetDataFind
  }
}));

vi.mock('@fastgpt/service/core/dataset/data/dataTextSchema', () => ({
  MongoDatasetDataText: {
    aggregate: mockMongoDatasetDataTextAggregate
  }
}));

import { searchDatasetData } from '../../../../core/dataset/search/defaultRecall';

afterEach(() => {
  serviceEnv.MULTIPLE_DATA_TO_BASE64 = originalMultipleDataToBase64;
});

describe('default recall dataset search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serviceEnv.MULTIPLE_DATA_TO_BASE64 = originalMultipleDataToBase64;
    mockCountPromptTokensBatch.mockImplementation(async (prompts: string[]) =>
      prompts.map((prompt) => prompt.length)
    );

    mockGetEmbeddingModel.mockReturnValue({
      model: 'mock-embedding-model',
      name: 'Mock Embedding Model'
    });
    mockGetDefaultRerankModel.mockReturnValue(undefined);
    mockGetLLMModel.mockReturnValue({
      model: 'mock-vlm-model',
      name: 'Mock VLM Model',
      vision: true
    });
    mockIsImageEmbeddingModel.mockReturnValue(false);
    mockGetVectors.mockResolvedValue({
      tokens: 10,
      vectors: [
        [0.1, 0.2],
        [0.3, 0.4]
      ]
    });
    mockRecallFromVectorStore.mockResolvedValue({
      results: []
    });
    mockMongoDatasetCollectionFind.mockImplementation((query: Record<string, any>) => {
      if (query?.forbid) return [];
      return {
        lean: vi.fn().mockResolvedValue([])
      };
    });
    mockMongoDatasetDataFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([])
    });
    mockMongoDatasetDataTextAggregate.mockResolvedValue([]);
  });

  it('should ignore failed image caption and continue dataset search', async () => {
    const userKey = { key: 'user-key', baseUrl: 'https://api.example.com/v1' };
    mockCreateLLMResponse.mockRejectedValueOnce(new Error('vlm failed')).mockResolvedValueOnce({
      requestId: 'req_image_caption_2',
      answerText: 'red handbag on a white table',
      usage: {
        inputTokens: 3,
        outputTokens: 2,
        usedUserOpenAIKey: true
      }
    });

    const result = await searchDatasetData({
      histories: [],
      teamId: 'team-1',
      model: 'mock-embedding-model',
      vlmModel: 'mock-vlm-model',
      datasetIds: ['dataset-1'],
      reRankQuery: 'black high heels',
      textQueries: ['black high heels'],
      imageQueries: ['data:image/png;base64,broken-image', 'data:image/png;base64,current-image'],
      userKey,
      limit: 5000,
      searchMode: DatasetSearchModeEnum.embedding,
      embeddingWeight: 0.5,
      usingReRank: false
    });

    expect(result.imageCaptionResult).toEqual({
      model: 'mock-vlm-model',
      inputTokens: 3,
      outputTokens: 2,
      requestIds: ['req_image_caption_2'],
      seconds: expect.any(Number),
      usedUserOpenAIKey: true,
      queries: ['red handbag on a white table']
    });
    expect(mockGetVectors).toHaveBeenCalledWith(
      expect.objectContaining({
        inputs: [
          {
            type: 'text',
            input: 'black high heels'
          },
          {
            type: 'text',
            input: 'red handbag on a white table'
          }
        ]
      })
    );
    expect(mockCreateLLMResponse.mock.calls[1][0].body.messages[0].content[0].image_url.url).toBe(
      'data:image/png;base64,current-image'
    );
    expect(mockCreateLLMResponse.mock.calls[1][0].userKey).toBe(userKey);
    expect(result.searchRes).toEqual([]);
  });

  it('should request text and image embeddings in one getVectors call', async () => {
    mockGetLLMModel.mockReturnValue(undefined);
    mockIsImageEmbeddingModel.mockReturnValue(true);
    mockGetVectors.mockResolvedValueOnce({
      tokens: 12,
      vectors: [
        [0.1, 0.2],
        [0.3, 0.4]
      ]
    });

    await searchDatasetData({
      histories: [],
      teamId: 'team-1',
      model: 'mock-embedding-model',
      datasetIds: ['dataset-1'],
      reRankQuery: 'black high heels',
      textQueries: ['black high heels'],
      imageQueries: ['data:image/png;base64,current-image'],
      limit: 5000,
      searchMode: DatasetSearchModeEnum.embedding,
      embeddingWeight: 0.5,
      usingReRank: false
    });

    expect(mockGetVectors).toHaveBeenCalledTimes(1);
    expect(mockGetVectors).toHaveBeenCalledWith(
      expect.objectContaining({
        inputs: [
          {
            type: 'text',
            input: 'black high heels'
          },
          {
            type: 'image',
            input: 'data:image/png;base64,current-image'
          }
        ]
      })
    );
    expect(mockGetImageBase64).not.toHaveBeenCalledWith('   ');
  });

  it('should skip blank embedding recall inputs while preserving valid task order', async () => {
    mockGetLLMModel.mockReturnValue(undefined);
    mockIsImageEmbeddingModel.mockReturnValue(true);
    mockGetVectors.mockResolvedValueOnce({
      tokens: 12,
      vectors: [
        [0.1, 0.2],
        [0.3, 0.4]
      ]
    });

    await searchDatasetData({
      histories: [],
      teamId: 'team-1',
      model: 'mock-embedding-model',
      datasetIds: ['dataset-1'],
      reRankQuery: 'black high heels',
      textQueries: ['   ', ' black high heels '],
      imageQueries: ['   ', 'data:image/png;base64,current-image'],
      limit: 5000,
      searchMode: DatasetSearchModeEnum.embedding,
      embeddingWeight: 0.5,
      usingReRank: false
    });

    expect(mockGetVectors).toHaveBeenCalledWith(
      expect.objectContaining({
        inputs: [
          {
            type: 'text',
            input: 'black high heels'
          },
          {
            type: 'image',
            input: 'data:image/png;base64,current-image'
          }
        ]
      })
    );
  });

  it('should ignore failed image embedding normalization and keep text recall', async () => {
    mockGetLLMModel.mockReturnValue(undefined);
    mockIsImageEmbeddingModel.mockReturnValue(true);
    serviceEnv.MULTIPLE_DATA_TO_BASE64 = true;
    mockGetImageBase64.mockRejectedValueOnce(new Error('expired image'));
    mockGetVectors.mockResolvedValueOnce({
      tokens: 12,
      vectors: [
        [0.1, 0.2],
        [0.3, 0.4]
      ]
    });

    await searchDatasetData({
      histories: [],
      teamId: 'team-1',
      model: 'mock-embedding-model',
      datasetIds: ['dataset-1'],
      reRankQuery: 'black high heels',
      textQueries: ['black high heels'],
      imageQueries: [
        'https://file.fastgpt.io/temp/team-1/expired.png?token=mock',
        'data:image/png;base64,current-image'
      ],
      limit: 5000,
      searchMode: DatasetSearchModeEnum.embedding,
      embeddingWeight: 0.5,
      usingReRank: false
    });

    expect(mockGetVectors).toHaveBeenCalledWith(
      expect.objectContaining({
        inputs: [
          {
            type: 'text',
            input: 'black high heels'
          },
          {
            type: 'image',
            input: 'data:image/png;base64,current-image'
          }
        ]
      })
    );
  });

  it('should skip blank full-text queries before Mongo text search', async () => {
    mockGetLLMModel.mockReturnValue(undefined);
    mockIsImageEmbeddingModel.mockReturnValue(false);

    const result = await searchDatasetData({
      histories: [],
      teamId: 'team-1',
      model: 'mock-embedding-model',
      datasetIds: ['dataset-1'],
      reRankQuery: '',
      textQueries: ['   ', '\n'],
      imageQueries: [],
      limit: 5000,
      searchMode: DatasetSearchModeEnum.fullTextRecall,
      embeddingWeight: 0.5,
      usingReRank: false
    });

    expect(mockGetVectors).not.toHaveBeenCalled();
    expect(mockMongoDatasetDataTextAggregate).not.toHaveBeenCalled();
    expect(result.searchRes).toEqual([]);
  });
});
