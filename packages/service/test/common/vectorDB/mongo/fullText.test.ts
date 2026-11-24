import { beforeEach, expect, it, vi } from 'vitest';
import { mongoFullTextAdapter } from '@fastgpt/service/common/vectorDB/mongo/fullText';

const { aggregate, collation, read, exec, connect, ensureIndex, assertIndex } = vi.hoisted(() => ({
  aggregate: vi.fn(),
  collation: vi.fn(),
  read: vi.fn(),
  exec: vi.fn(),
  connect: vi.fn(),
  ensureIndex: vi.fn(),
  assertIndex: vi.fn()
}));
vi.mock('@fastgpt/service/common/vectorDB/mongo/controller', () => ({
  connectEmbeddingMongo: connect
}));
vi.mock('@fastgpt/service/common/vectorDB/mongo/fullTextIndex', () => ({
  assertMongoFullTextIndex: assertIndex,
  ensureMongoFullTextIndex: ensureIndex,
  MongoFullTextSearchIndexName: 'embedding_search_fulltext'
}));
vi.mock('@fastgpt/service/common/vectorDB/mongo/schema', () => ({
  MongoDatasetDataEmbedding: { aggregate }
}));

const input = {
  teamId: 'team',
  datasetIds: ['left', 'right', 'left'],
  query: 'refund',
  limit: 3,
  forbidCollectionIdList: ['blocked']
};

beforeEach(() => {
  vi.clearAllMocks();
  assertIndex.mockReset().mockResolvedValue(undefined);
  aggregate.mockReturnValue({ collation });
  collation.mockReturnValue({ read });
  read.mockReturnValue({ exec });
  exec.mockResolvedValue([{ vectorId: 'first', collectionId: 'allowed', score: 1 }]);
});

it('uses one search for multiple datasets and checks current collection scope before limiting', async () => {
  const results = await mongoFullTextAdapter.search({
    ...input,
    filterCollectionIdList: ['allowed', 'blocked']
  });

  expect(results).toEqual([{ vectorId: 'first', collectionId: 'allowed', score: 1 }]);
  expect(aggregate).toHaveBeenCalledExactlyOnceWith([
    {
      $search: {
        index: 'embedding_search_fulltext',
        compound: {
          must: [{ text: { path: 'fulltextTokens', query: 'refund', matchCriteria: 'any' } }],
          filter: [
            { equals: { path: 'teamId', value: 'team' } },
            { in: { path: 'datasetId', value: ['left', 'right'] } },
            { in: { path: 'collectionId', value: ['allowed'] } }
          ]
        },
        sort: { score: { $meta: 'searchScore' }, _id: 1 }
      }
    },
    {
      $match: {
        teamId: 'team',
        datasetId: { $in: ['left', 'right'] },
        collectionId: { $in: ['allowed'] }
      }
    },
    { $limit: 3 },
    { $project: { _id: 0, vectorId: '$_id', collectionId: 1, score: { $meta: 'searchScore' } } }
  ]);
  expect(collation).toHaveBeenCalledWith({ locale: 'simple' });
  expect(read).toHaveBeenCalledWith('primary');
});

it('enforces denied collections in both the search index and current documents', async () => {
  await mongoFullTextAdapter.search(input);
  const [search, currentScope] = aggregate.mock.calls[0][0];
  expect(search.$search.compound.mustNot).toEqual([
    { in: { path: 'collectionId', value: ['blocked'] } }
  ]);
  expect(currentScope.$match.collectionId).toEqual({ $nin: ['blocked'] });
});

it('skips MongoDB when no collections are allowed', async () => {
  await expect(
    mongoFullTextAdapter.search({ ...input, filterCollectionIdList: ['blocked'] })
  ).resolves.toEqual([]);
  expect(connect).not.toHaveBeenCalled();
  expect(aggregate).not.toHaveBeenCalled();
});

it('reports an unavailable index separately from an empty successful search', async () => {
  exec.mockResolvedValue([]);
  assertIndex.mockRejectedValueOnce(new Error('index is not ready'));

  await expect(mongoFullTextAdapter.search(input)).rejects.toThrow('index is not ready');
  expect(aggregate).not.toHaveBeenCalled();
  await expect(mongoFullTextAdapter.search(input)).resolves.toEqual([]);
  expect(ensureIndex).not.toHaveBeenCalled();
});
