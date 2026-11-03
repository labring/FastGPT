import { describe, expect, it, vi } from 'vitest';
import {
  delDatasetRelevantData,
  dispatchDatasetStorageCleanup
} from '@fastgpt/service/core/dataset/controller';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { s3FileDeleteMQService } from '@fastgpt/dal/redis/bullmq';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoS3TTL } from '@fastgpt/service/common/s3/models/ttl';
import { S3PrivateBucket } from '@fastgpt/service/common/s3/buckets/private';
import { S3Buckets } from '@fastgpt/service/common/s3/config/constants';
import { getS3ParsedPrefix } from '@fastgpt/service/common/s3/opaqueKey';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { createDatasetCollectionFixture } from '@test/datas/dataset';

vi.unmock('@fastgpt/service/common/mongo/sessionRun');
const { executeS3DeleteJob } = await vi.importActual<
  typeof import('@fastgpt/service/common/s3/queue/delete')
>('@fastgpt/service/common/s3/queue/delete');

describe('delDatasetRelevantData', () => {
  it('rolls back collection and image rows together when clearing fails', async () => {
    const { scope } = await createDatasetCollectionFixture();
    const data = await MongoDatasetData.create({
      ...scope,
      q: 'retain on rollback',
      imageId: `dataset/${scope.datasetId}/file/${'2'.repeat(32)}.png`
    });
    await expect(
      mongoSessionRun(async (session) => {
        await delDatasetRelevantData({
          datasets: [{ _id: scope.datasetId, teamId: scope.teamId }],
          session
        });
        throw new Error('rollback');
      })
    ).rejects.toThrow('rollback');
    expect(await MongoDatasetCollection.findById(scope.collectionId)).toBeTruthy();
    expect(await MongoDatasetData.findById(data._id)).toBeTruthy();
    expect(await MongoS3TTL.countDocuments()).toBe(0);
  });

  it('retries clearing old resources without deleting new resources in the retained dataset', async () => {
    const { scope } = await createDatasetCollectionFixture();
    const oldFile = `dataset/${scope.datasetId}/file/${'a'.repeat(32)}.pdf`;
    const oldImagePrefix = `dataset/${scope.datasetId}/chunk-images/${scope.collectionId}/`;
    const oldKeys = [
      oldFile,
      `${getS3ParsedPrefix(oldFile)}${'b'.repeat(32)}.png`,
      `${oldImagePrefix}file/${'c'.repeat(32)}.png`,
      `dataset/${scope.datasetId}/file/${'1'.repeat(32)}.png`
    ];
    await MongoDatasetCollection.updateOne(
      { _id: scope.collectionId },
      {
        fileId: oldFile,
        chunkImagePrefixId: scope.collectionId
      }
    );
    const bucket = new S3PrivateBucket();
    const originalBuckets = global.s3BucketMap;
    const enqueue = vi
      .spyOn(s3FileDeleteMQService, 'addJob')
      .mockRejectedValue(new Error('queue offline'));
    global.s3BucketMap = { [S3Buckets.private]: bucket };
    try {
      await MongoDatasetData.create({ ...scope, q: 'old image', imageId: oldKeys[3] });
      for (const key of oldKeys)
        await bucket.client.uploadObject({ key, body: Buffer.from('old') });
      expect(
        (await MongoDatasetData.findOne({ collectionId: scope.collectionId }).lean())?.imageId
      ).toBe(oldKeys[3]);
      const cleanup = await mongoSessionRun((session) =>
        delDatasetRelevantData({
          datasets: [{ _id: scope.datasetId, teamId: scope.teamId }],
          session
        })
      );
      await expect(dispatchDatasetStorageCleanup(cleanup)).rejects.toThrow('queue offline');
      expect(await MongoDataset.findById(scope.datasetId)).toBeTruthy();
      expect(await MongoDatasetCollection.findById(scope.collectionId)).toBeNull();
      expect(await MongoS3TTL.countDocuments()).toBe(0);
      expect(cleanup).toEqual([
        { bucketName: S3Buckets.private, prefix: oldImagePrefix },
        { bucketName: S3Buckets.private, keys: [oldFile, oldKeys[3]] }
      ]);

      // 同库新集合可能在补投发生前已经写入。清空的删除范围不能扩大为整个 dataset/ 目录。
      const next = await MongoDatasetCollection.create({
        teamId: scope.teamId,
        tmbId: scope.tmbId,
        datasetId: scope.datasetId,
        type: 'file',
        name: 'new collection'
      });
      const newFile = `dataset/${scope.datasetId}/file/${'d'.repeat(32)}.pdf`;
      const newKeys = [
        newFile,
        `${getS3ParsedPrefix(newFile)}${'e'.repeat(32)}.png`,
        `dataset/${scope.datasetId}/chunk-images/${next._id}/file/${'f'.repeat(32)}.png`
      ];
      for (const key of newKeys)
        await bucket.client.uploadObject({ key, body: Buffer.from('new') });
      enqueue.mockClear().mockResolvedValue(undefined);
      // 本次调用方保留旧范围进行重试，不从已删除集合重新计算，也不使用 TTL 意图。
      await dispatchDatasetStorageCleanup(cleanup);
      expect(enqueue).toHaveBeenCalledTimes(2);
      for (const job of cleanup) await executeS3DeleteJob(job);
      for (const key of oldKeys)
        await expect(bucket.client.getObjectMetadata({ key })).rejects.toThrow();
      for (const key of newKeys)
        expect(await bucket.client.getObjectMetadata({ key })).toBeTruthy();
      expect(await MongoDatasetCollection.findById(next._id)).toBeTruthy();
      expect(await MongoS3TTL.countDocuments()).toBe(0);
    } finally {
      global.s3BucketMap = originalBuckets;
      enqueue.mockRestore();
    }
  });
});
