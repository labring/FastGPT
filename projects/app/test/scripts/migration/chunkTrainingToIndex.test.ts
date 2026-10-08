import { describe, expect, it, vi } from 'vitest';
import { connectionMongo, Types } from '@fastgpt/service/common/mongo';
import { migrateChunkTraining } from '../../../scripts/migration/chunkTrainingToIndex';

const db = () => connectionMongo.connection.db!;

/** 用真实 Mongo 验证跨集合提交和重跑；绕过当前 enum 写入历史 chunk 记录。 */
const seed = async (
  options: {
    mode?: string;
    status?: string;
    existing?: boolean;
    lockTime?: Date;
    retryCount?: number;
    imageId?: string;
  } = {}
) => {
  const scope = {
    teamId: new Types.ObjectId(),
    tmbId: new Types.ObjectId(),
    datasetId: new Types.ObjectId(),
    collectionId: new Types.ObjectId()
  };
  await db().collection('datasets').insertOne({ _id: scope.datasetId, teamId: scope.teamId });
  await db()
    .collection('dataset_collections')
    .insertOne({ _id: scope.collectionId, ...scope });
  const dataId = new Types.ObjectId();
  if (options.existing) {
    await db()
      .collection('dataset_datas')
      .insertOne({
        _id: dataId,
        ...scope,
        q: 'original',
        indexes: [{ type: 'custom', text: 'original index', dataId: 'old-vector' }],
        ...(options.status && { indexStatus: options.status })
      });
  }
  const task = {
    _id: new Types.ObjectId(),
    ...scope,
    mode: options.mode ?? 'chunk',
    billId: 'original-bill',
    q: 'draft text',
    a: 'answer',
    dataMetadata: { source: 'original' },
    indexes: [{ type: 'custom', text: 'custom draft' }],
    imageDescMap: { image: 'description' },
    retryCount: options.retryCount ?? 2,
    errorMsg: 'original error',
    lockTime: options.lockTime ?? new Date(0),
    expireAt: null,
    chunkIndex: 3,
    ...(options.existing && { dataId }),
    ...(options.imageId && { imageId: options.imageId })
  };
  await db().collection('dataset_trainings').insertOne(task);
  return task;
};
const run = (dryRun = false) =>
  migrateChunkTraining({
    connection: connectionMongo.connection,
    dryRun,
    batchSize: 1,
    privateBucket: 'private'
  });

describe('migrateChunkTraining', () => {
  it('previews without writes, then pre-creates once and preserves the full training payload', async () => {
    const task = await seed();
    const taskCollection = db().collection('dataset_trainings');
    const before = await taskCollection.findOne({ _id: task._id });
    expect(await run(true)).toMatchObject({ preCreated: 1, index: 1, remaining: 1 });
    expect(await db().collection('dataset_datas').countDocuments({})).toBe(0);
    expect(await taskCollection.findOne({ _id: task._id })).toEqual(before);
    expect(await run()).toMatchObject({ preCreated: 1, index: 1, remaining: 0 });
    expect(await taskCollection.findOne({ _id: task._id })).toEqual({
      ...before,
      mode: 'index',
      dataId: task._id
    });
    expect(await db().collection('dataset_datas').findOne({ _id: task._id })).toMatchObject({
      q: task.q,
      a: task.a,
      metadata: task.dataMetadata,
      chunkIndex: 3,
      indexes: [],
      indexStatus: 'indexing'
    });
    expect(await run()).toMatchObject({ scanned: 0, remaining: 0 });
    expect(await db().collection('dataset_datas').countDocuments({})).toBe(1);
  });

  it.each([
    ['indexing', 'index'],
    ['error', 'index'],
    ['indexed', 'rebuild'],
    [undefined, 'rebuild']
  ])('routes existing data with status %s to %s without changing vectors', async (status, mode) => {
    const task = await seed({ existing: true, status });
    const before = await db().collection('dataset_datas').findOne({ _id: task.dataId });
    await run();
    expect(await db().collection('dataset_trainings').findOne({ _id: task._id })).toMatchObject({
      mode,
      dataId: task.dataId
    });
    expect(await db().collection('dataset_datas').findOne({ _id: task.dataId })).toEqual(before);
  });

  it.each(['auto', 'image', 'imageParse'])(
    'pre-creates legacy %s without skipping the enhancement stage',
    async (mode) => {
      const task = await seed({ mode, retryCount: 0, imageId: 'dataset/image' });
      await db()
        .collection('s3_ttls')
        .insertMany([
          { minioKey: task.imageId, bucketName: 'private' },
          { minioKey: task.imageId, bucketName: 'public' }
        ]);
      await run();
      expect(await db().collection('dataset_trainings').findOne({ _id: task._id })).toMatchObject({
        mode,
        retryCount: 0,
        dataId: task._id
      });
      expect(await db().collection('dataset_datas').findOne({ _id: task._id })).toMatchObject({
        indexStatus: 'indexing'
      });
      expect(await db().collection('s3_ttls').find({}).toArray()).toMatchObject([
        { bucketName: 'public' }
      ]);
    }
  );

  it('preserves an exhausted final-index error on the newly created data', async () => {
    const task = await seed({ retryCount: 0 });
    await run();
    expect(await db().collection('dataset_datas').findOne({ _id: task._id })).toMatchObject({
      indexStatus: 'error',
      indexErrorMsg: 'original error'
    });
    expect(await db().collection('dataset_trainings').findOne({ _id: task._id })).toMatchObject({
      retryCount: 0,
      expireAt: null
    });
  });

  it('rejects a live lease but preserves blocked tasks for manual retry', async () => {
    const task = await seed({ lockTime: new Date() });
    await expect(run()).rejects.toThrow('active lease');
    expect(await db().collection('dataset_datas').countDocuments({})).toBe(0);
    await db()
      .collection('dataset_trainings')
      .updateOne({ _id: task._id }, { $set: { lockTime: new Date('2050-01-01') } });
    await run();
    expect(await db().collection('dataset_trainings').findOne({ _id: task._id })).toMatchObject({
      mode: 'index',
      lockTime: new Date('2050-01-01')
    });
  });

  it('retains orphan tasks and rejects data id collisions without overwriting data', async () => {
    const task = await seed({ existing: true });
    await db().collection('dataset_datas').deleteOne({ _id: task.dataId });
    await expect(run()).rejects.toThrow('referenced data missing');
    await db()
      .collection('dataset_trainings')
      .updateOne({ _id: task._id }, { $unset: { dataId: '' } });
    await db().collection('dataset_datas').insertOne({ _id: task._id, q: 'do not overwrite' });
    await expect(run()).rejects.toThrow('data id collision');
    expect(await db().collection('dataset_datas').findOne({ _id: task._id })).toMatchObject({
      q: 'do not overwrite'
    });
    expect(await db().collection('dataset_trainings').findOne({ _id: task._id })).toMatchObject({
      mode: 'chunk'
    });
  });

  it('rolls back data creation and image TTL cleanup when updating the source task fails', async () => {
    const task = await seed({ imageId: 'dataset/image' });
    await db().collection('s3_ttls').insertOne({ minioKey: task.imageId, bucketName: 'private' });
    const originalCollection = db().collection.bind(db());
    const trainings = originalCollection('dataset_trainings');
    vi.spyOn(trainings, 'updateOne').mockRejectedValueOnce(new Error('write failed'));
    const mock = vi
      .spyOn(db(), 'collection')
      .mockImplementation((name, options) =>
        name === 'dataset_trainings' ? trainings : originalCollection(name, options)
      );
    try {
      await expect(run()).rejects.toThrow('write failed');
    } finally {
      mock.mockRestore();
    }
    expect(await db().collection('dataset_datas').countDocuments({})).toBe(0);
    expect(await db().collection('s3_ttls').countDocuments({})).toBe(1);
    expect(await db().collection('dataset_trainings').findOne({ _id: task._id })).toMatchObject({
      mode: 'chunk'
    });
    await run();
    expect(await db().collection('dataset_datas').countDocuments({})).toBe(1);
  });
});
