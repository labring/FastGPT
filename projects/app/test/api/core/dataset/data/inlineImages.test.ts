import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import insertHandler from '@/pages/api/core/dataset/data/insertData';
import updateHandler from '@/pages/api/core/dataset/data/update';
import pushHandler from '@/pages/api/core/dataset/data/pushData';
import deleteHandler from '@/pages/api/core/dataset/data/delete';
import deleteCollectionHandler from '@/pages/api/core/dataset/collection/delete';
import updateTrainingHandler from '@/pages/api/core/dataset/training/updateTrainingData';
import { Call } from '@test/utils/request';
import { createDatasetCollectionFixture } from '@test/datas/dataset';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { MongoS3TTL } from '@fastgpt/service/common/s3/models/ttl';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { S3Buckets } from '@fastgpt/service/common/s3/config/constants';
import * as s3Utils from '@fastgpt/service/common/s3/utils';
import * as datasetSource from '@fastgpt/service/common/s3/sources/dataset';
import { s3FileDeleteMQService } from '@fastgpt/dal/redis/bullmq';
import { mockVectorInsert } from '@test/mocks/common/vector';
import { createVitestStorageMock } from '@fastgpt-sdk/storage';

vi.unmock('@fastgpt/service/common/mongo/sessionRun');
// 集合统计通知不属于图片事务验证，避免启动全局 Redis 队列运行时。
vi.mock('@fastgpt/service/core/dataset/collection/mq', () => ({
  pushCollectionUpdateJob: vi.fn()
}));
const { executeS3DeleteJob } = await vi.importActual<
  typeof import('@fastgpt/service/common/s3/queue/delete')
>('@fastgpt/service/common/s3/queue/delete');
const png =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aCVsAAAAASUVORK5CYII=';
const imageText = `before  ![image](data:image/png;base64,${png})\nafter`;

/** 本测试走真实模型选择，显式绑定 setupModels 提供的模型，避免依赖未配置的集合默认值。 */
const createContext = async () => {
  const context = await createDatasetCollectionFixture();
  await MongoDataset.updateOne(
    { _id: context.scope.datasetId },
    {
      vectorModelId: '68ad85a7463006c963799a69',
      agentModelId: '68ad85a7463006c963799a68'
    }
  );
  return context;
};

describe('direct data image ingestion', () => {
  const previousBuckets = global.s3BucketMap;
  let storage: ReturnType<typeof createVitestStorageMock>;
  const enqueue = vi.fn().mockResolvedValue(undefined);
  beforeEach(() => {
    storage = createVitestStorageMock({ vi, bucketName: S3Buckets.private });
    enqueue.mockClear();
    vi.spyOn(s3FileDeleteMQService, 'addJob').mockImplementation(({ bucketName, ...job }) =>
      enqueue(job)
    );
    global.s3BucketMap = {
      [S3Buckets.private]: { client: storage, addDeleteJob: enqueue }
    } as typeof global.s3BucketMap;
    vi.spyOn(s3Utils, 'uploadImage2S3Bucket').mockImplementation(async (_bucket, params) => {
      await storage.uploadObject({ key: params.uploadKey, body: params.buffer! });
      return params.uploadKey;
    });
    vi.spyOn(datasetSource, 'getS3DatasetSource').mockReturnValue({
      deleteDatasetFilesByKeys: vi.fn().mockResolvedValue(undefined)
    } as unknown as ReturnType<typeof datasetSource.getS3DatasetSource>);
  });
  afterEach(() => {
    global.s3BucketMap = previousBuckets;
    vi.restoreAllMocks();
  });

  it.each([false, true])(
    'normalizes manual insert and edit (explicit indexes: %s)',
    async (explicitIndexes) => {
      const { root, scope } = await createContext();
      const inserted = await Call(insertHandler, {
        auth: root,
        body: { collectionId: scope.collectionId, q: imageText, a: 'keep this answer' }
      });
      expect(inserted.code, String(inserted.error?.message ?? JSON.stringify(inserted))).toBe(200);
      const dataId = inserted.data.dataIds[0];
      const original = (await MongoDatasetData.findById(dataId).lean())!;
      expect(original.q).toContain(`/chunk-images/${scope.collectionId}/`);
      expect(original.q).not.toContain('base64,');
      expect(await MongoS3TTL.countDocuments()).toBe(0);
      const edited = await Call(updateHandler, {
        auth: root,
        body: {
          dataId,
          q: `edited ${imageText}`,
          ...(explicitIndexes && { indexes: [] })
        }
      });
      expect(edited.code, String(edited.error?.message ?? JSON.stringify(edited))).toBe(200);
      const current = (await MongoDatasetData.findById(dataId).lean())!;
      expect(current.q).toContain('edited before');
      expect(current.q).not.toContain('base64,');
      expect(current.a).toBe('keep this answer');
      expect(current.history?.[0].q).toBe(original.q);
      expect(await MongoS3TTL.countDocuments()).toBe(0);
    }
  );

  it.each(['chunk', 'qa'])(
    'promotes images on actual %s queue acceptance',
    async (trainingType) => {
      const { root, scope } = await createContext();
      const result = await Call(pushHandler, {
        auth: root,
        body: {
          collectionId: scope.collectionId,
          trainingType,
          data: [{ q: imageText }, { q: imageText }]
        }
      });
      expect(result.code, String(result.error?.message ?? JSON.stringify(result))).toBe(200);
      expect(result.data.insertLen).toBe(2);
      const tasks = await MongoDatasetTraining.find({ collectionId: scope.collectionId }).lean();
      expect(tasks).toHaveLength(2);
      expect(tasks[0].q).toBe(tasks[1].q);
      expect(tasks[0].q).not.toContain('base64,');
      expect(storage.uploadObject).toHaveBeenCalledTimes(1);
      expect(await MongoS3TTL.countDocuments()).toBe(0);
    }
  );

  it('normalizes a failed training task edit while preserving its unsubmitted answer', async () => {
    const { root, scope } = await createContext();
    const task = await MongoDatasetTraining.create({
      ...scope,
      billId: 'failed-image-edit',
      mode: 'index',
      retryCount: 0,
      errorMsg: 'failed',
      q: 'old question',
      a: 'keep original answer'
    });
    const result = await Call(updateTrainingHandler, {
      auth: root,
      body: { dataId: String(task._id), q: imageText }
    });
    expect(result.code, String(result.error?.message ?? JSON.stringify(result))).toBe(200);
    const updated = (await MongoDatasetTraining.findById(task._id).lean())!;
    expect(updated.q).toContain(`/chunk-images/${scope.collectionId}/`);
    expect(updated.q).not.toContain('base64,');
    expect(updated.a).toBe('keep original answer');
    expect(updated.retryCount).toBe(3);
    expect(await MongoS3TTL.countDocuments()).toBe(0);
  });

  it.each([false, true])(
    'keeps uploaded image TTL when the edited row disappears before saving (explicit indexes: %s)',
    async (explicitIndexes) => {
      const { root, scope } = await createContext();
      const inserted = await Call(insertHandler, {
        auth: root,
        body: { collectionId: scope.collectionId, q: 'original row' }
      });
      expect(inserted.code).toBe(200);
      const dataId = inserted.data.dataIds[0];
      // 在外部向量写入期间制造真实并发删除，图片提升不能随着空更新提交。
      mockVectorInsert.mockImplementationOnce(async () => {
        await MongoDatasetData.deleteOne({ _id: dataId });
        return { insertIds: ['replacement_vector'] };
      });
      const edited = await Call(updateHandler, {
        auth: root,
        body: { dataId, q: imageText, ...(explicitIndexes && { indexes: [] }) }
      });
      expect(edited.code).not.toBe(200);
      expect(await MongoDatasetData.findById(dataId)).toBeNull();
      expect(await MongoS3TTL.countDocuments()).toBe(1);
    }
  );

  it('keeps TTL for images belonging only to filtered-out QA chunks', async () => {
    const { root, scope } = await createContext();
    const result = await Call(pushHandler, {
      auth: root,
      body: {
        collectionId: scope.collectionId,
        trainingType: 'qa',
        data: [{ q: `${'x'.repeat(20000)} ${imageText}` }]
      }
    });
    expect(result.code).toBe(200);
    expect(result.data.insertLen).toBe(0);
    expect(await MongoDatasetTraining.countDocuments({ collectionId: scope.collectionId })).toBe(0);
    expect(await MongoS3TTL.countDocuments()).toBe(1);
  });

  it('retains shared images when all chunks are deleted, then cleans the source-less collection directory', async () => {
    const { root, scope } = await createContext();
    const pushed = await Call(pushHandler, {
      auth: root,
      body: {
        collectionId: scope.collectionId,
        data: [{ q: imageText }, { q: imageText }]
      }
    });
    expect(pushed.code, String(pushed.error?.message ?? JSON.stringify(pushed))).toBe(200);
    const items = await MongoDatasetData.find({ collectionId: scope.collectionId }).lean();
    const key = storage.uploadObject.mock.calls[0][0].key;
    // 预落库数据等待索引，测试明确置为已就绪后调用真实删除入口。
    await MongoDatasetData.updateMany(
      { collectionId: scope.collectionId },
      { $unset: { indexStatus: '' } }
    );
    for (const item of items) {
      const deleted = await Call(deleteHandler, { auth: root, query: { id: String(item._id) } });
      expect(deleted.code, String(deleted.error?.message ?? JSON.stringify(deleted))).toBe(200);
    }
    expect(await MongoDatasetData.countDocuments({ collectionId: scope.collectionId })).toBe(0);
    expect(await storage.getObjectMetadata({ key })).toBeTruthy();
    const removed = await Call(deleteCollectionHandler, {
      auth: root,
      body: { collectionIds: [scope.collectionId] }
    });
    expect(removed.code, String(removed.error?.message ?? JSON.stringify(removed))).toBe(200);
    expect(await MongoDatasetCollection.findById(scope.collectionId)).toBeNull();
    expect(enqueue).toHaveBeenCalledWith({
      prefix: `dataset/${scope.datasetId}/chunk-images/${scope.collectionId}/`
    });
    await executeS3DeleteJob({
      bucketName: S3Buckets.private,
      prefix: `dataset/${scope.datasetId}/chunk-images/${scope.collectionId}/`
    });
    await expect(storage.getObjectMetadata({ key })).rejects.toThrow();
    expect(await MongoS3TTL.countDocuments()).toBe(0);
  });
});
