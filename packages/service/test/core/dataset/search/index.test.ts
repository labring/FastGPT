import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSearchDatasetData = vi.hoisted(() => vi.fn());
const mockDatasetSearchQueryExtension = vi.hoisted(() => vi.fn());
const mockGetLLMModel = vi.hoisted(() => vi.fn());

vi.mock('@fastgpt/service/core/dataset/search/defaultRecall', () => ({
  searchDatasetData: mockSearchDatasetData
}));

vi.mock('@fastgpt/service/core/dataset/search/utils', () => ({
  datasetSearchQueryExtension: mockDatasetSearchQueryExtension
}));

vi.mock('@fastgpt/service/core/ai/model', () => ({
  getLLMModel: mockGetLLMModel
}));

import { defaultSearchDatasetData } from '../../../../core/dataset/search';

describe('defaultSearchDatasetData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchDatasetData.mockResolvedValue({
      searchRes: [],
      embeddingTokens: 0,
      reRankInputTokens: 0,
      searchMode: 'embedding',
      limit: 5000,
      similarity: 0,
      usingReRank: false,
      usingSimilarityFilter: false
    });
  });

  it('should drop whitespace-only text queries before extension and recall', async () => {
    await defaultSearchDatasetData({
      histories: [],
      teamId: 'team-1',
      datasetIds: ['dataset-1'],
      model: 'embedding-model',
      textQueries: ['   ', '\n'],
      imageQueries: ['https://files.example.com/query.png'],
      limit: 5000,
      datasetSearchUsingExtensionQuery: true
    });

    expect(mockDatasetSearchQueryExtension).not.toHaveBeenCalled();
    expect(mockSearchDatasetData).toHaveBeenCalledWith(
      expect.objectContaining({
        reRankQuery: '',
        textQueries: []
      })
    );
  });

  it('should trim text queries before query extension', async () => {
    mockGetLLMModel.mockReturnValue({
      model: 'query-extension-model'
    });
    mockDatasetSearchQueryExtension.mockResolvedValue({
      searchQueries: ['first', 'second', 'expanded'],
      reRankQuery: 'first\nsecond\nexpanded',
      aiExtensionResult: undefined
    });

    await defaultSearchDatasetData({
      histories: [],
      teamId: 'team-1',
      datasetIds: ['dataset-1'],
      model: 'embedding-model',
      textQueries: [' first ', ' ', 'second'],
      imageQueries: [],
      limit: 5000,
      datasetSearchUsingExtensionQuery: true,
      datasetSearchExtensionModel: 'query-extension-model'
    });

    expect(mockDatasetSearchQueryExtension).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'first\nsecond',
        llmModel: 'query-extension-model'
      })
    );
    expect(mockSearchDatasetData).toHaveBeenCalledWith(
      expect.objectContaining({
        reRankQuery: 'first\nsecond\nexpanded',
        textQueries: ['first', 'second', 'expanded']
      })
    );
  });
});
