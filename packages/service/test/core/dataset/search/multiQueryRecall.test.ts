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

  // NFR-8（越权召回 = 0）：权限可读集合必须在召回阶段生效，空集合不得回退为「全部可读」。
  it('skips recall entirely when the readable set is empty', async () => {
    const result = await multiQueryRecall({ ...baseParams, readableCollectionIdList: [] });

    expect(result).toEqual({
      tokens: 0,
      textEmbeddingRecallResults: [],
      imageCaptionEmbeddingRecallResults: [],
      imageVectorRecallResults: [],
      textFullTextRecallResults: [],
      imageCaptionFullTextRecallResults: []
    });
    expect(embeddingRecallMock).not.toHaveBeenCalled();
    expect(fullTextRecallMock).not.toHaveBeenCalled();
  });

  it('skips recall when the readable set does not intersect the metadata filter', async () => {
    filterCollectionByMetadataMock.mockResolvedValue(['metadata-only']);

    const result = await multiQueryRecall({
      ...baseParams,
      readableCollectionIdList: ['readable-only']
    });

    expect(result.tokens).toBe(0);
    expect(embeddingRecallMock).not.toHaveBeenCalled();
    expect(fullTextRecallMock).not.toHaveBeenCalled();
  });

  it('passes the readable set to both engines when the metadata filter is undefined', async () => {
    filterCollectionByMetadataMock.mockResolvedValue(undefined);

    await multiQueryRecall({ ...baseParams, readableCollectionIdList: ['readable-a'] });

    expect(embeddingRecallMock).toHaveBeenCalledWith(
      expect.objectContaining({ filterCollectionIdList: ['readable-a'] })
    );
    expect(fullTextRecallMock).toHaveBeenCalledWith(
      expect.objectContaining({ filterCollectionIdList: ['readable-a'] })
    );
  });

  it('passes the intersection of the readable set and the metadata filter', async () => {
    filterCollectionByMetadataMock.mockResolvedValue(['a', 'b']);

    await multiQueryRecall({ ...baseParams, readableCollectionIdList: ['b', 'c'] });

    expect(embeddingRecallMock).toHaveBeenCalledWith(
      expect.objectContaining({ filterCollectionIdList: ['b'] })
    );
    expect(fullTextRecallMock).toHaveBeenCalledWith(
      expect.objectContaining({ filterCollectionIdList: ['b'] })
    );
  });

  it('does not set a collection filter when both inputs are undefined', async () => {
    filterCollectionByMetadataMock.mockResolvedValue(undefined);

    await multiQueryRecall({ ...baseParams });

    expect(embeddingRecallMock).toHaveBeenCalledWith(
      expect.objectContaining({ filterCollectionIdList: undefined })
    );
  });
});
