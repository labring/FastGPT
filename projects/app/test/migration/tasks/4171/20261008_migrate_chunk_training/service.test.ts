import { beforeAll, describe, expect, it, vi } from 'vitest';
import { migrateLegacyTraining } from '@/migration/tasks/4171/20261008_migrate_chunk_training/service';
import { findAndLockTrainingTask } from '@fastgpt/service/core/dataset/training/entity';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { serviceEnv } from '@fastgpt/service/env';
vi.mock('@fastgpt/service/common/mongo/sessionRun', async (importOriginal) => importOriginal());

import { db, initializeMongoModels, seed } from './fixtures';

beforeAll(initializeMongoModels);

describe('migrateLegacyTraining', () => {
  it('pre-creates once, activates the task and preserves its business payload', async () => {
    const task = await seed();
    const taskCollection = db().collection('dataset_trainings');
    const before = await taskCollection.findOne({ _id: task._id });
    await migrateLegacyTraining(task._id);
    const { errorMsg: _errorMsg, ...payload } = before!;
    expect(await taskCollection.findOne({ _id: task._id })).toEqual({
      ...payload,
      mode: 'index',
      dataId: task._id,
      retryCount: 3,
      lockTime: new Date(0)
    });
    expect(await db().collection('dataset_datas').findOne({ _id: task._id })).toMatchObject({
      q: task.q,
      a: task.a,
      metadata: task.dataMetadata,
      chunkIndex: 3,
      indexes: [],
      indexStatus: 'indexing'
    });
    await findAndLockTrainingTask({ mode: TrainingModeEnum.index });
    const claimed = await taskCollection.findOne({ _id: task._id });
    expect(await migrateLegacyTraining(task._id)).toBeUndefined();
    expect(await taskCollection.findOne({ _id: task._id })).toEqual(claimed);
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
    await migrateLegacyTraining(task._id);
    expect(await db().collection('dataset_trainings').findOne({ _id: task._id })).toMatchObject({
      mode,
      dataId: task.dataId
    });
    expect(await db().collection('dataset_datas').findOne({ _id: task.dataId })).toEqual({
      ...before,
      ...(status === 'error' ? { indexStatus: 'indexing' } : {})
    });
  });

  it.each([TrainingModeEnum.auto, TrainingModeEnum.image, TrainingModeEnum.imageParse])(
    'pre-creates and reactivates exhausted legacy %s without skipping the enhancement stage',
    async (mode) => {
      const task = await seed({ mode, retryCount: 0, imageId: 'dataset/image' });
      await db()
        .collection('s3_ttls')
        .insertMany([
          { minioKey: task.imageId, bucketName: serviceEnv.STORAGE_PRIVATE_BUCKET },
          { minioKey: task.imageId, bucketName: 'public' }
        ]);
      await migrateLegacyTraining(task._id);
      expect(await db().collection('dataset_trainings').findOne({ _id: task._id })).toMatchObject({
        mode,
        retryCount: 3,
        lockTime: new Date(0),
        dataId: task._id
      });
      expect(await db().collection('dataset_datas').findOne({ _id: task._id })).toMatchObject({
        indexStatus: 'indexing'
      });
      const claimed = await findAndLockTrainingTask({ mode, filter: { _id: task._id } });
      expect(claimed).toMatchObject({ dataId: String(task._id), retryCount: 3 });
      expect(claimed).not.toHaveProperty('errorMsg');
      const beforeReplay = await db().collection('dataset_trainings').findOne({ _id: task._id });
      await migrateLegacyTraining(task._id);
      expect(await db().collection('dataset_trainings').findOne({ _id: task._id })).toEqual(
        beforeReplay
      );

      expect(await db().collection('s3_ttls').find({}).toArray()).toMatchObject([
        { bucketName: 'public' }
      ]);
    }
  );

  it('reactivates an exhausted final-index task and creates indexing data', async () => {
    const task = await seed({ retryCount: 0 });
    await migrateLegacyTraining(task._id);
    expect(await db().collection('dataset_datas').findOne({ _id: task._id })).toMatchObject({
      indexStatus: 'indexing'
    });
    expect(await db().collection('dataset_trainings').findOne({ _id: task._id })).toMatchObject({
      retryCount: 3,
      expireAt: null
    });
  });

  it('rejects a live lease but releases a blocked task after migration', async () => {
    const task = await seed({ lockTime: new Date() });
    await expect(migrateLegacyTraining(task._id)).rejects.toThrow('active lease');
    expect(await db().collection('dataset_datas').countDocuments({})).toBe(0);
    await db()
      .collection('dataset_trainings')
      .updateOne({ _id: task._id }, { $set: { lockTime: new Date('2050-01-01') } });
    await migrateLegacyTraining(task._id);
    expect(await db().collection('dataset_trainings').findOne({ _id: task._id })).toMatchObject({
      mode: 'index',
      lockTime: new Date(0)
    });
  });

  it('clears an existing data error atomically with task activation and preserves TTL', async () => {
    const task = await seed({ existing: true, status: 'error', retryCount: 0 });
    const expireAt = new Date();
    await db().collection('dataset_trainings').updateOne({ _id: task._id }, { $set: { expireAt } });
    await db()
      .collection('dataset_datas')
      .updateOne({ _id: task.dataId }, { $set: { indexErrorMsg: 'old error' } });
    await migrateLegacyTraining(task._id);
    const data = await db().collection('dataset_datas').findOne({ _id: task.dataId });
    expect(data).toMatchObject({ indexStatus: 'indexing' });
    expect(data).not.toHaveProperty('indexErrorMsg');
    const training = await db().collection('dataset_trainings').findOne({ _id: task._id });
    expect(training).toMatchObject({
      mode: 'index',
      retryCount: 3,
      lockTime: new Date(0),
      expireAt
    });
    expect(training).not.toHaveProperty('errorMsg');
  });

  it.each(['', 'unknown', 0])(
    'rejects invalid indexStatus %s without activating the task',
    async (indexStatus) => {
      const task = await seed({ existing: true });
      await db()
        .collection('dataset_datas')
        .updateOne({ _id: task.dataId }, { $set: { indexStatus } });
      await expect(migrateLegacyTraining(task._id)).rejects.toThrow('unknown indexStatus');
      expect(await db().collection('dataset_trainings').findOne({ _id: task._id })).toEqual(task);
    }
  );

  it('retains orphan tasks and rejects data id collisions without overwriting data', async () => {
    const task = await seed({ existing: true });
    await db().collection('dataset_datas').deleteOne({ _id: task.dataId });
    await expect(migrateLegacyTraining(task._id)).rejects.toThrow('referenced data missing');
    await db()
      .collection('dataset_trainings')
      .updateOne({ _id: task._id }, { $unset: { dataId: '' } });
    await db().collection('dataset_datas').insertOne({ _id: task._id, q: 'do not overwrite' });
    await expect(migrateLegacyTraining(task._id)).rejects.toThrow('data id collision');
    expect(await db().collection('dataset_datas').findOne({ _id: task._id })).toMatchObject({
      q: 'do not overwrite'
    });
    expect(await db().collection('dataset_trainings').findOne({ _id: task._id })).toMatchObject({
      mode: 'chunk'
    });
  });

  it('rolls back data creation and image TTL cleanup when updating the source task fails', async () => {
    const task = await seed({
      imageId: 'dataset/image',
      retryCount: 0,
      lockTime: new Date('2050-01-01')
    });
    await db()
      .collection('s3_ttls')
      .insertOne({ minioKey: task.imageId, bucketName: serviceEnv.STORAGE_PRIVATE_BUCKET });
    const originalCollection = db().collection.bind(db());
    const trainings = originalCollection('dataset_trainings');
    vi.spyOn(trainings, 'updateOne').mockRejectedValueOnce(new Error('write failed'));
    const mock = vi
      .spyOn(db(), 'collection')
      .mockImplementation((name, options) =>
        name === 'dataset_trainings' ? trainings : originalCollection(name, options)
      );
    try {
      await expect(migrateLegacyTraining(task._id)).rejects.toThrow('write failed');
    } finally {
      mock.mockRestore();
    }
    expect(await db().collection('dataset_datas').countDocuments({})).toBe(0);
    expect(await db().collection('s3_ttls').countDocuments({})).toBe(1);
    expect(await db().collection('dataset_trainings').findOne({ _id: task._id })).toMatchObject({
      mode: 'chunk',
      retryCount: 0,
      errorMsg: 'original error',
      lockTime: new Date('2050-01-01')
    });
    await migrateLegacyTraining(task._id);
    expect(await db().collection('dataset_datas').countDocuments({})).toBe(1);
  });
});
