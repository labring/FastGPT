import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constants';

const mockGetVectors = vi.hoisted(() => vi.fn());
const mockGetEmbeddingModel = vi.hoisted(() => vi.fn());
const mockGetDefaultRerankModel = vi.hoisted(() => vi.fn());
const mockGetLLMModel = vi.hoisted(() => vi.fn());
const mockIsImageEmbeddingModel = vi.hoisted(() => vi.fn());
const mockRecallFromVectorStore = vi.hoisted(() => vi.fn());
const mockCreateLLMResponse = vi.hoisted(() => vi.fn());
const mockMongoDatasetCollectionFind = vi.hoisted(() => vi.fn());
const mockMongoDatasetDataFind = vi.hoisted(() => vi.fn());
const mockGetDatasetBase64Image = vi.hoisted(() => vi.fn());

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

vi.mock('@fastgpt/service/common/s3/sources/dataset', () => ({
  getS3DatasetSource: () => ({
    getDatasetBase64Image: mockGetDatasetBase64Image
  })
}));

import { searchDatasetData } from '@fastgpt/service/core/dataset/search/controller';

describe('searchDatasetData image caption fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();

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
    mockGetDatasetBase64Image.mockResolvedValue('data:image/png;base64,from-s3');
  });

  it('should ignore failed image caption and continue dataset search', async () => {
    mockCreateLLMResponse.mockRejectedValueOnce(new Error('vlm failed')).mockResolvedValueOnce({
      answerText: 'red handbag on a white table',
      usage: {
        inputTokens: 3,
        outputTokens: 2
      }
    });

    const result = await searchDatasetData({
      histories: [],
      teamId: 'team-1',
      model: 'mock-embedding-model',
      vlmModel: 'mock-vlm-model',
      datasetIds: ['dataset-1'],
      reRankQuery: 'black high heels',
      queries: ['black high heels'],
      queryImageUrls: ['data:image/png;base64,broken-image', 'data:image/png;base64,current-image'],
      limit: 5000,
      searchMode: DatasetSearchModeEnum.embedding,
      embeddingWeight: 0.5,
      usingReRank: false
    });

    expect(result.imageCaptionResult).toEqual({
      model: 'mock-vlm-model',
      inputTokens: 3,
      outputTokens: 2,
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
      queries: ['black high heels'],
      queryImageUrls: ['data:image/png;base64,current-image'],
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
  });

  it('should ignore failed image embedding normalization and keep text recall', async () => {
    mockGetLLMModel.mockReturnValue(undefined);
    mockIsImageEmbeddingModel.mockReturnValue(true);
    mockGetDatasetBase64Image.mockRejectedValueOnce(new Error('expired image'));
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
      queries: ['black high heels'],
      queryImageUrls: ['temp/team-1/expired.png', 'data:image/png;base64,current-image'],
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
});
