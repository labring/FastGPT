import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getForbidCollectionIdListMock,
  filterCollectionByMetadataMock,
  filterLegacyCollectionByMetadataMock,
  embeddingRecallMock,
  fullTextRecallMock
} = vi.hoisted(() => ({
  getForbidCollectionIdListMock: vi.fn(),
  filterCollectionByMetadataMock: vi.fn(),
  filterLegacyCollectionByMetadataMock: vi.fn(),
  embeddingRecallMock: vi.fn(),
  fullTextRecallMock: vi.fn()
}));

vi.mock('@fastgpt/service/core/dataset/search/defaultRecall/collectionFilter', () => ({
  getForbidCollectionIdList: getForbidCollectionIdListMock,
  filterCollectionByMetadata: filterCollectionByMetadataMock
}));
vi.mock('@fastgpt/service/core/dataset/search/defaultRecall/legacy/collectionFilter', () => ({
  filterLegacyCollectionByMetadata: filterLegacyCollectionByMetadataMock
}));
vi.mock('@fastgpt/service/core/dataset/search/defaultRecall/embeddingRecall', () => ({
  embeddingRecall: embeddingRecallMock
}));
vi.mock('@fastgpt/service/core/dataset/search/defaultRecall/fullTextRecall', () => ({
  fullTextRecall: fullTextRecallMock
}));

import { multiQueryRecall } from '@fastgpt/service/core/dataset/search/defaultRecall/multiQueryRecall';

const baseParams = {
  teamId: 'team',
  datasetIds: ['dataset'],
  model: { model: 'embedding' } as any,
  imageQueries: [],
  collectionFilterMatch: '{}',
  embeddingLimit: 10,
  fullTextLimit: 10,
  textQueries: ['query'],
  imageCaptionQueries: []
};

describe('multiQueryRecall collection filter routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getForbidCollectionIdListMock.mockResolvedValue([]);
    filterCollectionByMetadataMock.mockResolvedValue([]);
    filterLegacyCollectionByMetadataMock.mockResolvedValue([]);
    embeddingRecallMock.mockResolvedValue({
      tokens: 0,
      textEmbeddingRecallResults: [],
      imageCaptionEmbeddingRecallResults: [],
      imageVectorRecallResults: []
    });
    fullTextRecallMock.mockResolvedValue({
      textFullTextRecallResults: [],
      imageCaptionFullTextRecallResults: []
    });
  });

  it.each([
    ['legacy', filterLegacyCollectionByMetadataMock, filterCollectionByMetadataMock],
    ['structured', filterCollectionByMetadataMock, filterLegacyCollectionByMetadataMock]
  ] as const)('calls only the %s filter', async (mode, expected, unexpected) => {
    await multiQueryRecall({ ...baseParams, collectionFilterMode: mode });
    expect(expected).toHaveBeenCalledOnce();
    expect(unexpected).not.toHaveBeenCalled();
  });
});
