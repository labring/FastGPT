import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import insertHandler from '@/pages/api/core/dataset/data/insertData';
import updateHandler from '@/pages/api/core/dataset/data/update';
import pushHandler from '@/pages/api/core/dataset/data/pushData';
import deleteHandler from '@/pages/api/core/dataset/data/delete';
import deleteCollectionHandler from '@/pages/api/core/dataset/collection/delete';
import updateTrainingHandler from '@/pages/api/core/dataset/training/updateTrainingData';
import { Call } from '@test/utils/request';
import { createDatasetCollectionFixture } from '@test/datas/dataset';
import { DatasetDataIndexStageEnum } from '@fastgpt/global/core/dataset/data/constants';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { datasetQaTrainingService } from '@fastgpt/service/core/dataset/training/qaService';
import { MongoS3TTL } from '@fastgpt/service/common/s3/models/ttl';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { S3Buckets } from '@fastgpt/service/common/s3/config/constants';
import * as s3Utils from '@fastgpt/service/common/s3/utils';
import * as datasetSource from '@fastgpt/service/common/s3/sources/dataset';
import { s3FileDeleteMQService } from '@fastgpt/dal/redis/bullmq';
import { mockVectorInsert } from '@test/mocks/common/vector';
import { createVitestStorageMock } from '@fastgpt-sdk/storage';
import { formatDatasetDataValue } from '@fastgpt/service/core/dataset/data/controller';
import * as s3AccessLink from '@fastgpt/service/common/s3/accessLink';

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
      deleteDatasetFilesByKeys: vi.fn().mockResolvedValue(undefined),
      createGetDatasetFileURL: vi.fn(
        async ({ key }: { key: string }) => `https://preview.test/${key}`
      )
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
      const tasks =
        trainingType === 'qa'
          ? await datasetQaTrainingService.list({ collectionId: String(scope.collectionId) })
          : await MongoDatasetData.find({ collectionId: scope.collectionId }).lean();
      expect(tasks).toHaveLength(2);
      expect(tasks[0].q).toBe(tasks[1].q);
      expect(tasks[0].q).not.toContain('base64,');
      expect(storage.uploadObject).toHaveBeenCalledTimes(1);
      expect(await MongoS3TTL.countDocuments()).toBe(0);
    }
  );

  it('normalizes a failed training task edit while preserving its unsubmitted answer', async () => {
    const { root, scope } = await createContext();
    await MongoDatasetCollection.updateOne(
      { _id: scope.collectionId },
      {
        $set: {
          training: {
            status: 'active',
            usageId: new Types.ObjectId().toHexString(),
            revision: 1
          }
        }
      }
    );
    const task = await MongoDatasetData.create({
      ...scope,
      indexStatus: DatasetDataIndexStageEnum.index,
      indexError: true,
      indexErrorMsg: 'failed',
      q: 'old question',
      a: 'keep original answer'
    });
    const result = await Call(updateTrainingHandler, {
      auth: root,
      body: { dataId: String(task._id), q: imageText }
    });
    expect(result.code, String(result.error?.message ?? JSON.stringify(result))).toBe(200);
    const updated = (await MongoDatasetData.findById(task._id).lean())!;
    expect(updated.q).toContain(`/chunk-images/${scope.collectionId}/`);
    expect(updated.q).not.toContain('base64,');
    expect(updated.a).toBe('keep original answer');
    expect(updated.indexError).toBeUndefined();
    expect(await MongoS3TTL.countDocuments()).toBe(0);

    // 若未提交的回答中已有 3 张受管内联图，单独编辑问题新增第 4 张图应在上传前被拒绝且保留原回答
    const existingKeys = [1, 2, 3].map(
      (n) =>
        `dataset/${scope.datasetId}/chunk-images/${scope.collectionId}/file/${String(n).repeat(32)}.png`
    );
    await MongoDatasetData.updateOne(
      { _id: task._id },
      {
        $set: {
          indexError: true,
          indexErrorMsg: 'failed',
          a: existingKeys.map((k, i) => `![e${i}](${k})`).join(' ')
        }
      }
    );
    storage.uploadObject.mockClear();
    const rejected = await Call(updateTrainingHandler, {
      auth: root,
      body: { dataId: String(task._id), q: imageText }
    });
    expect(rejected.code).not.toBe(200);
    expect(String(rejected.error?.message ?? rejected.message)).toContain(
      'at most 3 inline images'
    );
    expect(storage.uploadObject).not.toHaveBeenCalled();
    expect(await MongoS3TTL.countDocuments()).toBe(0);

    // 历史任务或分块未提交字段含旧 Base64（合法或非法）时，仅编辑另一字段不应上传未提交字段或拒绝编辑
    const legacyValidTask = await MongoDatasetData.create({
      ...scope,
      indexStatus: DatasetDataIndexStageEnum.index,
      indexError: true,
      indexErrorMsg: 'failed',
      q: 'old q',
      a: imageText
    });
    storage.uploadObject.mockClear();
    const editOnlyQ = await Call(updateTrainingHandler, {
      auth: root,
      body: { dataId: String(legacyValidTask._id), q: 'plain text updated q' }
    });
    expect(editOnlyQ.code, String(editOnlyQ.error?.message ?? JSON.stringify(editOnlyQ))).toBe(200);
    expect(storage.uploadObject).not.toHaveBeenCalled();
    expect(await MongoS3TTL.countDocuments()).toBe(0);
    const savedLegacyValid = (await MongoDatasetData.findById(legacyValidTask._id).lean())!;
    expect(savedLegacyValid.q).toBe('plain text updated q');
    expect(savedLegacyValid.a).toBe(imageText);

    const legacyInvalidTask = await MongoDatasetData.create({
      ...scope,
      indexStatus: DatasetDataIndexStageEnum.index,
      indexError: true,
      indexErrorMsg: 'failed',
      q: 'old q',
      a: '![broken](data:image/png;base64,@@@)'
    });
    const editWithInvalidUnsubmitted = await Call(updateTrainingHandler, {
      auth: root,
      body: { dataId: String(legacyInvalidTask._id), q: 'fixed q only' }
    });
    expect(
      editWithInvalidUnsubmitted.code,
      String(
        editWithInvalidUnsubmitted.error?.message ?? JSON.stringify(editWithInvalidUnsubmitted)
      )
    ).toBe(200);
    expect(storage.uploadObject).not.toHaveBeenCalled();
    expect(await MongoS3TTL.countDocuments()).toBe(0);
    const savedLegacyInvalid = (await MongoDatasetData.findById(legacyInvalidTask._id).lean())!;
    expect(savedLegacyInvalid.q).toBe('fixed q only');
    expect(savedLegacyInvalid.a).toBe('![broken](data:image/png;base64,@@@)');

    // data/update 仅修改 q 时同样不触发未提交历史 Base64 的上传或报错
    const legacyRow = await MongoDatasetData.create({
      ...scope,
      q: 'legacy row q',
      a: '![broken](data:image/png;base64,@@@)',
      chunkIndex: 0,
      indexes: []
    });
    const editRowQOnly = await Call(updateHandler, {
      auth: root,
      body: { dataId: String(legacyRow._id), q: 'updated row q only' }
    });
    expect(
      editRowQOnly.code,
      String(editRowQOnly.error?.message ?? JSON.stringify(editRowQOnly))
    ).toBe(200);
    expect(storage.uploadObject).not.toHaveBeenCalled();
    expect(await MongoS3TTL.countDocuments()).toBe(0);
    const savedLegacyRow = (await MongoDatasetData.findById(legacyRow._id).lean())!;
    expect(savedLegacyRow.q).toBe('updated row q only');
    expect(savedLegacyRow.a).toBe('![broken](data:image/png;base64,@@@)');
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
    expect(await datasetQaTrainingService.count({ collectionId: String(scope.collectionId) })).toBe(
      0
    );
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

  it('signs nested-bracket alt images and inline answers on independent imageId chunks after ingestion', async () => {
    const { root, scope } = await createContext();
    vi.spyOn(s3AccessLink, 'createS3DownloadAccessUrls').mockImplementation(async (params) =>
      params.map(({ objectKey }) => `https://preview.test/${objectKey}`)
    );

    const inserted = await Call(insertHandler, {
      auth: root,
      body: {
        collectionId: scope.collectionId,
        q: `See ![Figure [1]](data:image/png;base64,${png})`
      }
    });
    expect(inserted.code, String(inserted.error?.message ?? JSON.stringify(inserted))).toBe(200);
    const nestedRow = (await MongoDatasetData.findById(inserted.data.dataIds[0]).lean())!;
    const nestedFormatted = await formatDatasetDataValue(
      { q: nestedRow.q, a: nestedRow.a, imageId: nestedRow.imageId },
      { datasetIds: [scope.datasetId] }
    );
    expect(nestedFormatted.q).toContain(
      `![Figure [1]](https://preview.test/dataset/${scope.datasetId}/chunk-images/${scope.collectionId}/file/`
    );

    const mainImageKey = `dataset/${scope.datasetId}/file/${'9'.repeat(32)}.png`;
    const imageRow = await MongoDatasetData.create({
      ...scope,
      q: 'Main image caption',
      imageId: mainImageKey,
      chunkIndex: 1,
      indexes: []
    });
    const edited = await Call(updateHandler, {
      auth: root,
      body: {
        dataId: String(imageRow._id),
        q: 'Main image caption',
        a: `Answer ![Detail [2]](data:image/png;base64,${png})`
      }
    });
    expect(edited.code, String(edited.error?.message ?? JSON.stringify(edited))).toBe(200);
    const updatedImageRow = (await MongoDatasetData.findById(imageRow._id).lean())!;
    expect(updatedImageRow.a).toContain(`/chunk-images/${scope.collectionId}/`);
    expect(await MongoS3TTL.countDocuments()).toBe(0);

    const imageFormatted = await formatDatasetDataValue(
      { q: updatedImageRow.q, a: updatedImageRow.a, imageId: updatedImageRow.imageId },
      { datasetIds: [scope.datasetId] }
    );
    expect(imageFormatted.imagePreivewUrl).toBe(`https://preview.test/${mainImageKey}`);
    expect(imageFormatted.q).toBe(`![Main image caption](https://preview.test/${mainImageKey})`);
    expect(imageFormatted.a).toContain(
      `![Detail [2]](https://preview.test/dataset/${scope.datasetId}/chunk-images/${scope.collectionId}/file/`
    );
  });
});
