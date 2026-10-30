import { beforeEach, describe, expect, it, vi } from 'vitest';
import { connectionMongo } from '@fastgpt/service/common/mongo';
import type { DatasetDataEmbedding } from '@fastgpt/global/core/dataset/data/embedding/type';
import { DatasetDataEmbeddingMongoSchema } from '@fastgpt/service/common/vectorDB/mongo/schema';
import { MongoVectorCtrl } from '@fastgpt/service/common/vectorDB/mongo';

vi.unmock('@fastgpt/service/common/vectorDB/mongo');

const model = connectionMongo.model<DatasetDataEmbedding>(
  'MongoEmbeddingProviderTest',
  DatasetDataEmbeddingMongoSchema,
  'mongo_embedding_provider_test'
);
const vector = [1, ...Array(1535).fill(0)];
const createCtrl = () => {
  const controller = new MongoVectorCtrl(model);
  vi.spyOn(controller, 'init').mockResolvedValue(undefined);
  return controller;
};

describe('MongoVectorCtrl CRUD', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('inserts distinct string IDs, counts filters and scans by creation time', async () => {
    const controller = createCtrl();
    expect(
      await controller.insert({ teamId: 'a', datasetId: 'd', collectionId: 'c', vectors: [] })
    ).toEqual({ insertIds: [] });
    const before = new Date();
    const { insertIds } = await controller.insert({
      teamId: 'a',
      datasetId: 'd',
      collectionId: 'c',
      vectors: [vector, vector],
      texts: ['one', 'two']
    });
    expect(new Set(insertIds).size).toBe(2);
    expect(insertIds[0]).toMatch(/^[a-f0-9]{24}$/);
    expect(
      await controller.getVectorCount({ teamId: 'a', datasetId: 'd', collectionId: 'c' })
    ).toBe(2);
    expect(await controller.getVectorCount({ teamId: 'other' })).toBe(0);
    expect(await controller.getVectorCount({})).toBe(2);
    const found = await controller.getVectorDataByTime(before, new Date());
    expect(found.map(({ id }) => id).sort()).toEqual(insertIds.sort());
    expect(found.every(({ teamId, datasetId }) => teamId === 'a' && datasetId === 'd')).toBe(true);
  });

  it('validates the complete insert batch before any writes', async () => {
    const controller = createCtrl();
    await expect(
      controller.insert({ teamId: 'a', datasetId: 'd', collectionId: 'c', vectors: [vector, []] })
    ).rejects.toThrow();
    await expect(
      controller.insert({
        teamId: 'a',
        datasetId: 'd',
        collectionId: 'c',
        vectors: [vector],
        texts: []
      })
    ).rejects.toThrow();
    expect(await model.countDocuments()).toBe(0);
  });

  it.each(['id', 'idList', 'dataset', 'collection', 'emptyIds', 'emptyCollections'] as const)(
    'deletes only the matching team and scope (%s)',
    async (mode) => {
      const controller = createCtrl();
      await model.insertMany([
        {
          _id: '1',
          teamId: 'a',
          datasetId: 'd',
          collectionId: 'c',
          vector,
          createTime: new Date()
        },
        {
          _id: '2',
          teamId: 'b',
          datasetId: 'd',
          collectionId: 'c',
          vector,
          createTime: new Date()
        },
        { _id: '3', teamId: 'a', datasetId: 'e', collectionId: 'x', vector, createTime: new Date() }
      ]);
      if (mode === 'id') await controller.delete({ teamId: 'a', id: '1' });
      if (mode === 'idList') await controller.delete({ teamId: 'a', idList: ['1', '2'] });
      if (mode === 'dataset') await controller.delete({ teamId: 'a', datasetIds: ['d'] });
      if (mode === 'collection')
        await controller.delete({ teamId: 'a', datasetIds: ['d'], collectionIds: ['c'] });
      if (mode === 'emptyIds') await controller.delete({ teamId: 'a', idList: [] });
      if (mode === 'emptyCollections')
        await controller.delete({ teamId: 'a', datasetIds: ['d'], collectionIds: [] });
      expect(await model.countDocuments({ _id: '2' })).toBe(1);
      expect(await model.countDocuments({ _id: '3' })).toBe(1);
      expect(await model.countDocuments({ _id: '1' })).toBe(mode.startsWith('empty') ? 1 : 0);
    }
  );

  it('refreshes only existing vectors owned by the team without altering content', async () => {
    const controller = createCtrl();
    const createTime = new Date('2020-01-01');
    await model.insertMany(
      ['a', 'b'].map((teamId, i) => ({
        _id: String(i),
        teamId,
        datasetId: 'd',
        collectionId: 'c',
        vector,
        createTime
      }))
    );
    await controller.refreshCreateTime({ teamId: 'a', idList: [] });
    await controller.refreshCreateTime({ teamId: 'a', idList: ['0', '1', 'missing'] });
    expect((await model.findById('0').lean())?.createTime.getTime()).toBeGreaterThan(
      createTime.getTime()
    );
    expect((await model.findById('1').lean())?.createTime).toEqual(createTime);
    expect((await model.findById('0').lean())?.vector).toEqual(vector);
    expect(await model.countDocuments()).toBe(2);
  });
});

describe('MongoVectorCtrl.embRecall', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('pre-filters tenant, datasets and allow/deny intersection and returns exact rescored values', async () => {
    const controller = createCtrl();
    const aggregate = vi
      .spyOn(model, 'aggregate')
      .mockResolvedValue([{ _id: '414', collectionId: 'allowed', score: 0.5 }]);
    const result = await controller.embRecall({
      teamId: 'team',
      datasetIds: ['dataset'],
      vector,
      limit: 10,
      forbidCollectionIdList: ['denied'],
      filterCollectionIdList: ['allowed', 'denied']
    });
    expect(result.results).toEqual([{ id: '414', collectionId: 'allowed', score: 0.5 }]);
    const pipeline = aggregate.mock.calls[0][0];
    expect(pipeline?.[0]).toMatchObject({
      $vectorSearch: {
        numCandidates: 200,
        limit: 20,
        filter: {
          teamId: 'team',
          datasetId: { $in: ['dataset'] },
          collectionId: { $in: ['allowed', 'denied'], $nin: ['denied'] }
        }
      }
    });
  });

  it('uses exact search beyond the ANN candidate limit and omits unrequested collection filters', async () => {
    const controller = createCtrl();
    const aggregate = vi.spyOn(model, 'aggregate').mockResolvedValue([]);
    await controller.embRecall({
      teamId: 'a',
      datasetIds: ['d'],
      vector,
      limit: 10001,
      forbidCollectionIdList: []
    });
    const query = aggregate.mock.calls[0][0]?.[0] as { $vectorSearch: Record<string, unknown> };
    expect(query.$vectorSearch.exact).toBe(true);
    expect(query.$vectorSearch.numCandidates).toBeUndefined();
    expect(query.$vectorSearch.filter).toEqual({ teamId: 'a', datasetId: { $in: ['d'] } });
  });

  it.each([
    { datasetIds: [], limit: 10 },
    { datasetIds: ['d'], limit: 0 },
    { datasetIds: ['d'], limit: 10, filterCollectionIdList: [] },
    { datasetIds: ['d'], limit: 10, filterCollectionIdList: ['blocked'] }
  ])('never queries an empty readable scope', async (props) => {
    const controller = createCtrl();
    const aggregate = vi.spyOn(model, 'aggregate');
    expect(
      await controller.embRecall({
        teamId: 'a',
        vector,
        forbidCollectionIdList: ['blocked'],
        ...props
      })
    ).toEqual({ results: [] });
    expect(aggregate).not.toHaveBeenCalled();
  });
});
