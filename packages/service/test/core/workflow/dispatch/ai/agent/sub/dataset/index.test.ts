import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constants';

const mockDefaultSearchDatasetData = vi.hoisted(() => vi.fn());
const mockMongoDatasetFindById = vi.hoisted(() => vi.fn());

vi.mock('@fastgpt/service/core/dataset/search/controller', () => ({
  defaultSearchDatasetData: mockDefaultSearchDatasetData
}));

vi.mock('@fastgpt/service/core/dataset/schema', () => ({
  MongoDataset: {
    findById: mockMongoDatasetFindById
  }
}));

vi.mock('@fastgpt/service/core/ai/model', () => ({
  getEmbeddingModel: vi.fn(() => ({
    model: 'mock-embedding-model',
    name: 'Mock Embedding Model'
  })),
  getLLMModel: vi.fn(() => ({
    maxContext: 8000
  })),
  getRerankModel: vi.fn(() => undefined)
}));

vi.mock('@fastgpt/service/common/string/tiktoken/index', () => ({
  countPromptTokens: vi.fn().mockResolvedValue(0)
}));

vi.mock('@fastgpt/service/support/wallet/usage/utils', () => ({
  formatModelChars2Points: vi.fn(() => ({
    totalPoints: 0,
    modelName: 'Mock Model'
  }))
}));

import { dispatchAgentDatasetSearch } from '@fastgpt/service/core/workflow/dispatch/ai/agent/sub/dataset';

describe('dispatchAgentDatasetSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockMongoDatasetFindById.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        vectorModel: {
          model: 'mock-embedding-model'
        }
      })
    });

    mockDefaultSearchDatasetData.mockResolvedValue({
      searchRes: [],
      embeddingTokens: 3,
      reRankInputTokens: 0,
      usingSimilarityFilter: false,
      usingReRank: false,
      queryExtensionResult: undefined
    });
  });

  it('should pass current image urls into dataset search and node response', async () => {
    const result = await dispatchAgentDatasetSearch({
      args: JSON.stringify({ query: 'find similar product' }),
      datasetParams: {
        datasets: [
          {
            datasetId: 'dataset-1',
            name: 'Dataset',
            avatar: ''
          }
        ],
        similarity: 0.6,
        limit: 1500,
        searchMode: DatasetSearchModeEnum.embedding,
        embeddingWeight: 0.7,
        usingReRank: false,
        rerankModel: '',
        rerankWeight: 0.5,
        datasetSearchUsingExtensionQuery: false,
        datasetSearchExtensionModel: '',
        datasetSearchExtensionBg: ''
      } as any,
      queryImageUrls: ['/api/file/current.png'],
      teamId: 'team-1',
      tmbId: 'tmb-1',
      llmModel: 'gpt-4o'
    });

    expect(mockDefaultSearchDatasetData).toHaveBeenCalledWith(
      expect.objectContaining({
        queries: ['find similar product'],
        queryImageUrls: ['/api/file/current.png'],
        datasetIds: ['dataset-1'],
        teamId: 'team-1'
      })
    );

    expect(result.nodeResponse?.queryImages).toEqual([
      {
        url: '/api/file/current.png',
        name: 'current.png'
      }
    ]);
  });
});
