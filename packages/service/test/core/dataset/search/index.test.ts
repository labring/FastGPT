import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSearchDatasetData = vi.hoisted(() => vi.fn());
const mockDatasetSearchQueryExtension = vi.hoisted(() => vi.fn());

vi.mock('@fastgpt/service/core/dataset/search/defaultRecall', () => ({
  searchDatasetData: mockSearchDatasetData
}));

vi.mock('@fastgpt/service/core/dataset/search/utils', () => ({
  datasetSearchQueryExtension: mockDatasetSearchQueryExtension
}));

import { defaultSearchDatasetData } from '../../../../core/dataset/search';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type {
  EmbeddingSystemModelDataType,
  LLMSystemModelDataType
} from '@fastgpt/global/core/ai/model.schema';

const embeddingModel: EmbeddingSystemModelDataType = {
  provider: 'test',
  model: 'embedding-model',
  name: 'Embedding model',
  modelId: '68ad85a7463006c963799a01',
  scope: 'system' as const,
  type: ModelTypeEnum.embedding,
  config: {
    defaultToken: 512,
    maxToken: 8192,
    weight: 0
  }
};
const extensionModel: LLMSystemModelDataType = {
  provider: 'test',
  model: 'query-extension-model',
  name: 'Query extension model',
  modelId: '68ad85a7463006c963799a02',
  scope: 'system' as const,
  type: ModelTypeEnum.llm,
  config: {
    maxContext: 32000,
    maxResponse: 4000,
    quoteMaxToken: 16000
  }
};

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
      model: embeddingModel,
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
    mockDatasetSearchQueryExtension.mockResolvedValue({
      searchQueries: ['first', 'second', 'expanded'],
      reRankQuery: 'first\nsecond\nexpanded',
      aiExtensionResult: undefined
    });

    await defaultSearchDatasetData({
      histories: [],
      teamId: 'team-1',
      datasetIds: ['dataset-1'],
      model: embeddingModel,
      textQueries: [' first ', ' ', 'second'],
      imageQueries: [],
      limit: 5000,
      datasetSearchUsingExtensionQuery: true,
      datasetSearchExtensionModel: extensionModel
    });

    expect(mockDatasetSearchQueryExtension).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'first\nsecond',
        llmModel: extensionModel
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
