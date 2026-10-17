import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSearchDatasetData = vi.hoisted(() => vi.fn());
const mockDatasetSearchQueryExtension = vi.hoisted(() => vi.fn());
const mockAttachMappings = vi.hoisted(() => vi.fn());

vi.mock('@fastgpt/service/core/dataset/synonym/searchResult', () => ({
  attachSynonymMappingsToSearchResults: mockAttachMappings
}));

vi.mock('@fastgpt/service/core/dataset/search/defaultRecall', () => ({
  searchDatasetData: mockSearchDatasetData
}));

vi.mock('@fastgpt/service/core/dataset/search/utils', () => ({
  datasetSearchQueryExtension: mockDatasetSearchQueryExtension
}));

import { defaultSearchDatasetData, deepRagSearch } from '../../../../core/dataset/search';
import type { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type {
  EmbeddingModelDataType,
  LLMModelDataType
} from '@fastgpt/global/core/ai/model/schema';

const embeddingModel: EmbeddingModelDataType = {
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
const extensionModel: LLMModelDataType = {
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
  it('decorates Deep RAG final results and candidates without changing billing metadata', async () => {
    const quote: SearchDataResponseItemType = {
      id: 'external',
      q: 'alias',
      a: '',
      chunkIndex: 0,
      updateTime: new Date(),
      datasetId: 'dataset-1',
      collectionId: 'collection-1',
      sourceName: 'source',
      score: []
    };
    const raw = {
      searchRes: [quote],
      retrievalResults: [quote],
      embeddingTokens: 7,
      reRankInputTokens: 9,
      searchMode: 'embedding' as const,
      limit: 5000,
      similarity: 0,
      usingReRank: true,
      usingSimilarityFilter: false
    };
    const handler = vi.fn().mockResolvedValue(raw);
    vi.stubGlobal('deepRagHandler', handler);
    mockAttachMappings.mockImplementation(async ({ results }) =>
      results.map((item: SearchDataResponseItemType) => ({
        ...item,
        synonymMappings: { alias: 'standard' },
        synonymMappingsTruncated: true
      }))
    );
    try {
      const result = await deepRagSearch({
        histories: [],
        teamId: 'team-1',
        datasetIds: ['dataset-1'],
        model: embeddingModel,
        textQueries: ['alias'],
        limit: 5000
      });
      expect(result.searchRes[0].synonymMappings).toEqual({ alias: 'standard' });
      expect(result.retrievalResults?.[0].synonymMappingsTruncated).toBe(true);
      expect(result).toMatchObject({ embeddingTokens: 7, reRankInputTokens: 9, usingReRank: true });
      expect(mockAttachMappings).toHaveBeenCalledWith({
        teamId: 'team-1',
        datasetIds: ['dataset-1'],
        results: [quote, quote]
      });
      expect(raw.searchRes[0].synonymMappings).toBeUndefined();
    } finally {
      vi.unstubAllGlobals();
    }
  });

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
