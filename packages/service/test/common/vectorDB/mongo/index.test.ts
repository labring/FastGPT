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

  it('pre-filters scopes and rescores, orders and truncates candidates by exact dot product', async () => {
    const controller = createCtrl();
    const queryVector = [0.6, 0.8, ...Array(1534).fill(0)];
    // 保留 Schema 外的模拟近似分数，确保未执行精排时无法误通过断言。
    await model.insertMany(
      [
        { _id: 'low', vector: [0, -1, ...Array(1534).fill(0)], score: 0.99 },
        { _id: 'tie-a', vector, score: 0.98 },
        { _id: 'tie-Z', vector, score: 0.97 },
        { _id: 'tie-2', vector, score: 0.965 },
        { _id: 'tie-10', vector, score: 0.96 },
        { _id: 'tie-\uE000', vector, score: 0.955 },
        { _id: 'tie-\u{10000}', vector, score: 0.95 },
        { _id: 'best', vector: queryVector, score: 0.95 }
      ].map((candidate) => ({
        ...candidate,
        teamId: 'team',
        datasetId: 'dataset',
        collectionId: 'allowed',
        createTime: new Date()
      })),
      { lean: true }
    );

    // 只替代依赖 mongot 的首阶段；原始内积、排序和截断仍交给真实 MongoDB。
    const aggregateCandidates = model.aggregate.bind(model);
    const aggregate = vi
      .spyOn(model, 'aggregate')
      .mockImplementation((pipeline = []) =>
        aggregateCandidates([{ $sort: { score: -1 } }, ...pipeline.slice(1)])
      );
    const result = await controller.embRecall({
      teamId: 'team',
      datasetIds: ['dataset'],
      vector: queryVector,
      limit: 7,
      forbidCollectionIdList: ['denied'],
      filterCollectionIdList: ['allowed', 'denied']
    });
    expect(result.results).toEqual([
      { id: 'best', collectionId: 'allowed', score: 1 },
      { id: 'tie-10', collectionId: 'allowed', score: 0.6 },
      { id: 'tie-2', collectionId: 'allowed', score: 0.6 },
      { id: 'tie-Z', collectionId: 'allowed', score: 0.6 },
      { id: 'tie-a', collectionId: 'allowed', score: 0.6 },
      { id: 'tie-\uE000', collectionId: 'allowed', score: 0.6 },
      { id: 'tie-\u{10000}', collectionId: 'allowed', score: 0.6 }
    ]);
    const pipeline = aggregate.mock.calls[0][0];
    expect(pipeline?.[0]).toMatchObject({
      $vectorSearch: {
        queryVector,
        exact: true,
        limit: 7,
        filter: {
          teamId: 'team',
          datasetId: { $in: ['dataset'] },
          collectionId: { $in: ['allowed', 'denied'], $nin: ['denied'] }
        }
      }
    });
    expect(pipeline?.[1]).toEqual({
      $project: {
        _id: 1,
        collectionId: 1,
        score: { $similarityDotProduct: ['$vector', { $literal: queryVector }] }
      }
    });
  });

  it('keeps raw negative and near-zero dot products without score normalization', async () => {
    const controller = createCtrl();
    const queryVector = [Math.SQRT1_2, 1e-17, -Math.SQRT1_2, ...Array(1533).fill(0)];
    const third = 1 / Math.sqrt(3);
    await model.insertMany(
      [
        { _id: 'cancel', vector: [third, third, third, ...Array(1533).fill(0)] },
        { _id: 'tiny', vector: [0, 1, ...Array(1534).fill(0)] },
        { _id: 'negative', vector: queryVector.map((value) => -value) },
        { _id: 'best', vector: queryVector }
      ].map((candidate) => ({
        ...candidate,
        teamId: 'a',
        datasetId: 'd',
        collectionId: 'c',
        createTime: new Date()
      }))
    );
    const aggregateCandidates = model.aggregate.bind(model);
    vi.spyOn(model, 'aggregate').mockImplementation((pipeline = []) =>
      aggregateCandidates(pipeline.slice(1))
    );
    const { results } = await controller.embRecall({
      teamId: 'a',
      datasetIds: ['d'],
      vector: queryVector,
      limit: 4,
      forbidCollectionIdList: []
    });
    expect(results.map(({ id }) => id)).toEqual(['best', 'tiny', 'cancel', 'negative']);
    expect(results[1].score).toBe(1e-17);
    expect(results[2].score).toBeCloseTo(0, 15);
    expect(results[0].score).toBeCloseTo(1, 15);
    expect(results[3].score).toBeCloseTo(-1, 15);
  });

  it('uses the legacy score expression only after an unsupported native operator and remembers it', async () => {
    const controller = createCtrl();
    await model.create({
      _id: 'fallback',
      teamId: 'a',
      datasetId: 'd',
      collectionId: 'c',
      vector,
      createTime: new Date()
    });
    const aggregateCandidates = model.aggregate.bind(model);
    const aggregate = vi
      .spyOn(model, 'aggregate')
      .mockImplementationOnce(() => {
        throw Object.assign(
          new Error(
            "Invalid $project :: caused by :: Unrecognized expression '$similarityDotProduct'"
          ),
          { code: 168 }
        );
      })
      .mockImplementation((pipeline = []) => aggregateCandidates(pipeline.slice(1)));
    const props = {
      teamId: 'a',
      datasetIds: ['d'],
      vector,
      limit: 100,
      forbidCollectionIdList: []
    };
    const expected = { results: [{ id: 'fallback', collectionId: 'c', score: 1 }] };
    await expect(controller.embRecall(props)).resolves.toEqual(expected);
    await expect(controller.embRecall(props)).resolves.toEqual(expected);
    expect(aggregate).toHaveBeenCalledTimes(3);
    expect(aggregate.mock.calls[0][0]?.[1]).toHaveProperty('$project.score.$similarityDotProduct');
    for (const call of aggregate.mock.calls.slice(1))
      expect(call[0]?.[1]).toHaveProperty('$project.score.$sum');
  });

  it.each([
    new Error('search timeout'),
    { code: 168, message: "Unrecognized expression '$similarityDotProduct'" },
    Object.assign(new Error('Unrecognized expression for a different operator'), { code: 168 }),
    Object.assign(new Error("Unrecognized expression '$similarityDotProduct'"), { code: 123 })
  ])('propagates other search errors without a legacy retry (%s)', async (error) => {
    const controller = createCtrl();
    await model.create({
      _id: 'error',
      teamId: 'a',
      datasetId: 'd',
      collectionId: 'c',
      vector,
      createTime: new Date()
    });
    const aggregate = vi.spyOn(model, 'aggregate').mockRejectedValue(error);
    await expect(
      controller.embRecall({
        teamId: 'a',
        datasetIds: ['d'],
        vector,
        limit: 100,
        forbidCollectionIdList: []
      })
    ).rejects.toBe(error);
    expect(aggregate).toHaveBeenCalledOnce();
  });

  it.each([
    { rows: 200000, limit: 100, expected: { exact: true, limit: 100 } },
    { rows: 200001, limit: 100, expected: { numCandidates: 4000, limit: 200 } },
    { rows: 200001, limit: 10001, expected: { exact: true, limit: 10001 } }
  ])(
    'selects ENN or ANN by the filtered scope (rows=$rows, limit=$limit)',
    async ({ rows, limit, expected }) => {
      const controller = createCtrl();
      // 只替代规模探测结果，保留真实 Query 以核对传给 MongoDB 的计数上限。
      const countQuery = model.countDocuments();
      vi.spyOn(countQuery, 'exec').mockResolvedValue(rows);
      const count = vi.spyOn(model, 'countDocuments').mockReturnValue(countQuery);
      const aggregate = vi.spyOn(model, 'aggregate').mockResolvedValue([]);
      await controller.embRecall({
        teamId: 'a',
        datasetIds: ['d'],
        vector,
        limit,
        forbidCollectionIdList: ['blocked'],
        filterCollectionIdList: ['allowed', 'blocked']
      });

      const filter = {
        teamId: 'a',
        datasetId: { $in: ['d'] },
        collectionId: { $in: ['allowed', 'blocked'], $nin: ['blocked'] }
      };
      expect(count).toHaveBeenCalledExactlyOnceWith(filter);
      expect(countQuery.getOptions().limit).toBe(200001);
      const stage = aggregate.mock.calls[0][0]?.[0];
      expect(stage).toMatchObject({ $vectorSearch: { ...expected, filter } });
      expect(stage).not.toHaveProperty(
        'exact' in expected ? '$vectorSearch.numCandidates' : '$vectorSearch.exact'
      );
    }
  );

  it('does not query the search index when the filtered scope has no stored vectors', async () => {
    const controller = createCtrl();
    const aggregate = vi.spyOn(model, 'aggregate');
    await expect(
      controller.embRecall({
        teamId: 'a',
        datasetIds: ['d'],
        vector,
        limit: 100,
        forbidCollectionIdList: []
      })
    ).resolves.toEqual({ results: [] });
    expect(aggregate).not.toHaveBeenCalled();
  });

  it('propagates scope counting failures without running a search with a guessed scope', async () => {
    const controller = createCtrl();
    const countQuery = model.countDocuments();
    vi.spyOn(countQuery, 'exec').mockRejectedValue(new Error('count unavailable'));
    vi.spyOn(model, 'countDocuments').mockReturnValue(countQuery);
    const aggregate = vi.spyOn(model, 'aggregate');
    await expect(
      controller.embRecall({
        teamId: 'a',
        datasetIds: ['d'],
        vector,
        limit: 100,
        forbidCollectionIdList: []
      })
    ).rejects.toThrow('count unavailable');
    expect(aggregate).not.toHaveBeenCalled();
  });

  it.each([
    { datasetIds: [], limit: 10 },
    { datasetIds: ['d'], limit: 0 },
    { datasetIds: ['d'], limit: 10, filterCollectionIdList: [] },
    { datasetIds: ['d'], limit: 10, filterCollectionIdList: ['blocked'] }
  ])('never queries an empty readable scope', async (props) => {
    const controller = createCtrl();
    const aggregate = vi.spyOn(model, 'aggregate');
    const count = vi.spyOn(model, 'countDocuments');
    expect(
      await controller.embRecall({
        teamId: 'a',
        vector,
        forbidCollectionIdList: ['blocked'],
        ...props
      })
    ).toEqual({ results: [] });
    expect(aggregate).not.toHaveBeenCalled();
    expect(count).not.toHaveBeenCalled();
  });
});
