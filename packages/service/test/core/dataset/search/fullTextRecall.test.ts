import { beforeEach, describe, expect, it, vi } from 'vitest';

const { searchMock, dataFindMock, collectionFindMock } = vi.hoisted(() => ({
  searchMock: vi.fn(),
  dataFindMock: vi.fn(),
  collectionFindMock: vi.fn()
}));

vi.mock('@fastgpt/service/core/dataset/data/textStore', () => ({
  getFullTextStore: () => ({ search: searchMock })
}));
vi.mock('@fastgpt/service/core/dataset/data/schema', () => ({
  MongoDatasetData: { find: dataFindMock }
}));
vi.mock('@fastgpt/service/core/dataset/collection/schema', () => ({
  MongoDatasetCollection: { find: collectionFindMock }
}));

import { fullTextRecall } from '@fastgpt/service/core/dataset/search/defaultRecall/fullTextRecall';

const teamId = '507f1f77bcf86cd799439001';
const datasetId = '507f1f77bcf86cd799439002';
const collectionId = '507f1f77bcf86cd799439003';
const dataId = '507f1f77bcf86cd799439004';
const baseProps = {
  teamId,
  datasetIds: [datasetId],
  queryGroups: [{ source: 'text' as const, queries: ['question'] }],
  limit: 10,
  forbidCollectionIdList: []
};
const emptyResult = { textFullTextRecallResults: [], imageCaptionFullTextRecallResults: [] };

beforeEach(() => {
  searchMock.mockReset().mockResolvedValue([]);
  dataFindMock.mockReset().mockReturnValue({ lean: () => Promise.resolve([]) });
  collectionFindMock.mockReset().mockReturnValue({ lean: () => Promise.resolve([]) });
});

describe('fullTextRecall empty and invalid engine candidates', () => {
  it.each([
    ['zero limit', { limit: 0 }],
    ['empty dataset set', { datasetIds: [] }],
    ['empty readable set', { filterCollectionIdList: [] }],
    ['blank queries', { queryGroups: [{ source: 'text' as const, queries: [' ', '\n'] }] }]
  ])('does not query an engine or Mongo for %s', async (_, overrides) => {
    await expect(fullTextRecall({ ...baseProps, ...overrides })).resolves.toEqual(emptyResult);
    expect(searchMock).not.toHaveBeenCalled();
    expect(dataFindMock).not.toHaveBeenCalled();
    expect(collectionFindMock).not.toHaveBeenCalled();
  });

  it('avoids Mongo queries for an empty engine result', async () => {
    await expect(fullTextRecall(baseProps)).resolves.toEqual(emptyResult);
    expect(dataFindMock).not.toHaveBeenCalled();
    expect(collectionFindMock).not.toHaveBeenCalled();
  });

  it.each([
    ['invalid data ID', { dataId: 'not-an-object-id', collectionId, score: 1 }],
    ['invalid collection ID', { dataId, collectionId: 'not-an-object-id', score: 1 }],
    ['empty data ID', { dataId: '', collectionId, score: 1 }],
    ['empty collection ID', { dataId, collectionId: '', score: 1 }]
  ])('discards %s before constructing Mongo queries', async (_, hit) => {
    searchMock.mockResolvedValue([hit]);

    await expect(fullTextRecall(baseProps)).resolves.toEqual(emptyResult);
    expect(dataFindMock).not.toHaveBeenCalled();
    expect(collectionFindMock).not.toHaveBeenCalled();
  });

  it('does not hydrate a result outside the effective collection filter', async () => {
    searchMock.mockResolvedValue([{ dataId, collectionId, score: 1 }]);

    await expect(
      fullTextRecall({ ...baseProps, filterCollectionIdList: ['507f1f77bcf86cd799439005'] })
    ).resolves.toEqual(emptyResult);
    expect(dataFindMock).not.toHaveBeenCalled();
    expect(collectionFindMock).not.toHaveBeenCalled();
  });

  it('does not hydrate a forbidden result', async () => {
    searchMock.mockResolvedValue([{ dataId, collectionId, score: 1 }]);

    await expect(
      fullTextRecall({ ...baseProps, forbidCollectionIdList: [collectionId] })
    ).resolves.toEqual(emptyResult);
    expect(dataFindMock).not.toHaveBeenCalled();
    expect(collectionFindMock).not.toHaveBeenCalled();
  });

  it('passes team, dataset and collection bounds to both hydration queries', async () => {
    searchMock.mockResolvedValue([{ dataId, collectionId, score: 1 }]);

    await fullTextRecall(baseProps);

    expect(dataFindMock).toHaveBeenCalledWith(
      {
        teamId,
        datasetId: { $in: [datasetId] },
        collectionId: { $in: [collectionId] },
        _id: { $in: [dataId] }
      },
      expect.any(Object),
      expect.any(Object)
    );
    expect(collectionFindMock).toHaveBeenCalledWith(
      {
        teamId,
        datasetId: { $in: [datasetId] },
        _id: { $in: [collectionId] },
        forbid: { $ne: true }
      },
      expect.objectContaining({ datasetId: 1 }),
      expect.any(Object)
    );
  });

  it('propagates backend failures instead of silently returning a successful empty search', async () => {
    searchMock.mockRejectedValue(new Error('engine unavailable'));
    await expect(fullTextRecall(baseProps)).rejects.toThrow('engine unavailable');
    expect(dataFindMock).not.toHaveBeenCalled();
  });
});
