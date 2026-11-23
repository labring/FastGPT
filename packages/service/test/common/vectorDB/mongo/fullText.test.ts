import { afterAll, beforeAll, expect, inject, it, vi } from 'vitest';
import { mongoFullTextAdapter } from '@fastgpt/service/common/vectorDB/mongo/fullText';
import {
  embeddingMongo,
  MongoDatasetDataEmbedding
} from '@fastgpt/service/common/vectorDB/mongo/schema';

vi.mock('@fastgpt/service/common/vectorDB/mongo/controller', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/common/vectorDB/mongo/controller')>()),
  connectEmbeddingMongo: async () => {}
}));

const datasetIds = ['left', ...Array.from({ length: 8 }, (_, i) => `empty-${i}`), 'right', 'left'];
const input = {
  teamId: 'team',
  datasetIds,
  query: 'refund',
  limit: 3,
  filterCollectionIdList: ['allowed', 'blocked'],
  forbidCollectionIdList: ['blocked']
};
const rows = [
  { _id: '\u{10000}', datasetId: 'left', fulltextTokens: 'refund guide' },
  { _id: '\uE000', datasetId: 'right', fulltextTokens: 'refund guide' },
  { _id: 'best', datasetId: 'right', fulltextTokens: 'refund refund refund' },
  { _id: 'low', datasetId: 'left', fulltextTokens: 'refund guide policy help' },
  {
    _id: 'blocked',
    datasetId: 'right',
    collectionId: 'blocked',
    fulltextTokens: 'refund refund refund refund'
  },
  { _id: 'outside', datasetId: 'outside', fulltextTokens: 'refund refund refund refund' },
  { _id: 'another-team', datasetId: 'right', teamId: 'another-team', fulltextTokens: 'refund' }
].map((row) => ({
  teamId: 'team',
  collectionId: 'allowed',
  createTime: new Date(),
  vector: [],
  ...row
}));

beforeAll(async () => {
  const uri = new URL(inject('MONGODB_URI'));
  uri.pathname += '_mongo_fulltext';
  await embeddingMongo.connect(uri.toString());
});

afterAll(async () => {
  await embeddingMongo.connection.db?.dropDatabase();
  await embeddingMongo.disconnect();
});

it('matches single-query Mongo ranking across batches, including binary tie order', async () => {
  const reference = embeddingMongo.connection.collection('team_fulltext_reference');
  await reference.insertMany(rows);
  await reference.createIndex(
    { teamId: 1, fulltextTokens: 'text' },
    { default_language: 'none', collation: { locale: 'simple' } }
  );
  await MongoDatasetDataEmbedding.insertMany(rows);

  const expected = await reference
    .aggregate(
      [
        {
          $match: {
            teamId: input.teamId,
            datasetId: { $in: datasetIds },
            collectionId: { $in: ['allowed'] },
            $text: { $search: input.query }
          }
        },
        { $project: { _id: 0, vectorId: '$_id', collectionId: 1, score: { $meta: 'textScore' } } },
        { $sort: { score: -1, vectorId: 1 } },
        { $limit: input.limit }
      ],
      { collation: { locale: 'simple' } }
    )
    .toArray();

  expect(expected.map(({ vectorId }) => vectorId)).toEqual(['best', '\uE000', '\u{10000}']);
  await expect(mongoFullTextAdapter.search(input)).resolves.toEqual(expected);
});

it('caps concurrent dataset queries across requests and propagates a query failure', async () => {
  let active = 0;
  let maxActive = 0;
  const exec = vi.fn(async () => {
    active++;
    maxActive = Math.max(maxActive, active);
    await new Promise<void>((resolve) => setImmediate(resolve));
    active--;
    return [];
  });
  const aggregate = vi.spyOn(MongoDatasetDataEmbedding, 'aggregate').mockReturnValue({
    collation() {
      return this;
    },
    read() {
      return this;
    },
    exec
  } as ReturnType<typeof MongoDatasetDataEmbedding.aggregate>);
  try {
    await Promise.all([mongoFullTextAdapter.search(input), mongoFullTextAdapter.search(input)]);
    expect(maxActive).toBe(8);
    expect(exec).toHaveBeenCalledTimes(20);

    aggregate.mockClear();
    exec.mockRejectedValueOnce(new Error('dataset query failed'));
    await expect(mongoFullTextAdapter.search(input)).rejects.toThrow('dataset query failed');
    expect(aggregate.mock.calls.length).toBeLessThanOrEqual(8);
  } finally {
    aggregate.mockRestore();
  }
});
