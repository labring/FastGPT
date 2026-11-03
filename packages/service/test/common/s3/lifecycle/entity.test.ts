import { afterEach, describe, expect, it, vi } from 'vitest';
import { MongoS3TTL } from '@fastgpt/service/common/s3/models/ttl';
import { S3Buckets } from '@fastgpt/service/common/s3/config/constants';
import { S3PrivateBucket } from '@fastgpt/service/common/s3/buckets/private';
import {
  createChunkImagePrefixCleanup,
  createDatasetPrefixCleanup,
  createDatasetFileCleanup,
  claimChunkImageUploadCleanup
} from '@fastgpt/service/common/s3/lifecycle/entity';
import {
  enqueueS3LifecycleCleanup,
  dispatchS3LifecycleCleanup
} from '@fastgpt/service/common/s3/lifecycle/service';
import { getDatasetCleanupPrefix } from '@fastgpt/service/common/s3/lifecycle/utils';
import { getS3ParsedPrefix } from '@fastgpt/service/common/s3/opaqueKey';
import { getChunkImagePrefix } from '@fastgpt/service/common/s3/sources/dataset/chunkImageKey';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { createDatasetCollectionFixture } from '@test/datas/dataset';

vi.unmock('@fastgpt/service/common/mongo/sessionRun');
const { executeS3DeleteJob } = await vi.importActual<
  typeof import('@fastgpt/service/common/s3/queue/delete')
>('@fastgpt/service/common/s3/queue/delete');

describe('collection image cleanup lifecycle', () => {
  const originalBuckets = global.s3BucketMap;
  afterEach(() => {
    global.s3BucketMap = originalBuckets;
    vi.restoreAllMocks();
  });

  const setup = async () => {
    const { scope } = await createDatasetCollectionFixture();
    const prefix = getChunkImagePrefix({
      datasetId: scope.datasetId,
      chunkImagePrefixId: scope.collectionId
    });
    const key = `${prefix}file/${'b'.repeat(32)}.png`;
    const bucket = new S3PrivateBucket();
    await bucket.client.uploadObject({ key, body: Buffer.from('fixture') });
    global.s3BucketMap = { [S3Buckets.private]: bucket };
    return { scope, prefix, key, bucket };
  };

  it('cannot claim a stale snapshot after the upload TTL was removed', async () => {
    const { key } = await setup();
    const record = await MongoS3TTL.create({
      bucketName: S3Buckets.private,
      minioKey: key,
      expiredTime: new Date(0),
      cleanupType: 'collectionImageUpload'
    });
    await MongoS3TTL.deleteOne({ _id: record._id });
    expect(await claimChunkImageUploadCleanup(record.toObject())).toBe(false);
  });

  it('keeps an expired upload record until physical deletion succeeds', async () => {
    const { key, bucket } = await setup();
    const record = await MongoS3TTL.create({
      bucketName: S3Buckets.private,
      minioKey: key,
      expiredTime: new Date(0),
      cleanupType: 'collectionImageUpload'
    });
    const enqueue = vi.spyOn(bucket, 'addDeleteJob').mockResolvedValue(undefined);
    await enqueueS3LifecycleCleanup(record.toObject());
    expect(enqueue).toHaveBeenCalledWith({ key });
    expect(await MongoS3TTL.findById(record._id)).toBeTruthy();
    await executeS3DeleteJob({ bucketName: S3Buckets.private, key });
    expect(await MongoS3TTL.findById(record._id)).toBeNull();
    await expect(bucket.client.getObjectMetadata({ key })).rejects.toThrow();
  });

  it('does not delete accepted images through an ordinary key deletion job', async () => {
    const { key, bucket } = await setup();
    await executeS3DeleteJob({ bucketName: S3Buckets.private, key });
    expect(await bucket.client.getObjectMetadata({ key })).toBeTruthy();
  });

  it.each(['', 'file/'])('rejects incomplete managed directory deletion: %s', async (suffix) => {
    const { prefix, key, bucket } = await setup();
    const invalidPrefix = suffix
      ? `${prefix}${suffix}`
      : prefix.split('/').slice(0, 3).join('/') + '/';
    await expect(
      executeS3DeleteJob({ bucketName: S3Buckets.private, prefix: invalidPrefix })
    ).rejects.toThrow('Invalid chunk image cleanup prefix');
    expect(await bucket.client.getObjectMetadata({ key })).toBeTruthy();
  });

  it.each(['collection', 'dataset'])(
    'records %s directory cleanup transactionally and retries storage failures',
    async (kind) => {
      const { scope, prefix: collectionPrefix, key, bucket } = await setup();
      const prefix =
        kind === 'dataset' ? getDatasetCleanupPrefix(scope.datasetId) : collectionPrefix;
      const ids = await mongoSessionRun((session) =>
        kind === 'dataset'
          ? createDatasetPrefixCleanup({ datasetIds: [scope.datasetId], session })
          : createChunkImagePrefixCleanup({
              scopes: [{ datasetId: scope.datasetId, chunkImagePrefixId: scope.collectionId }],
              session
            })
      );
      const enqueue = vi
        .spyOn(bucket, 'addDeleteJob')
        .mockRejectedValueOnce(new Error('queue offline'));
      await dispatchS3LifecycleCleanup(ids);
      expect(await MongoS3TTL.findById(ids[0])).toBeTruthy();
      enqueue.mockResolvedValue(undefined);
      await dispatchS3LifecycleCleanup(ids);
      expect(enqueue).toHaveBeenLastCalledWith({ prefix });
      vi.mocked(bucket.client.deleteObjectsByPrefix).mockRejectedValueOnce(
        new Error('storage offline')
      );
      await expect(executeS3DeleteJob({ bucketName: S3Buckets.private, prefix })).rejects.toThrow(
        'storage offline'
      );
      expect(await MongoS3TTL.findById(ids[0])).toBeTruthy();
      await executeS3DeleteJob({ bucketName: S3Buckets.private, prefix });
      expect(await MongoS3TTL.findById(ids[0])).toBeNull();
      await expect(bucket.client.getObjectMetadata({ key })).rejects.toThrow();
      await executeS3DeleteJob({ bucketName: S3Buckets.private, prefix });
    }
  );

  it.each(['collection', 'dataset'])(
    'rolls back %s cleanup intent with business deletion failure',
    async (kind) => {
      const { scope } = await setup();
      await expect(
        mongoSessionRun(async (session) => {
          if (kind === 'dataset')
            await createDatasetPrefixCleanup({ datasetIds: [scope.datasetId], session });
          else
            await createChunkImagePrefixCleanup({
              scopes: [{ datasetId: scope.datasetId, chunkImagePrefixId: scope.collectionId }],
              session
            });
          throw new Error('rollback');
        })
      ).rejects.toThrow('rollback');
      expect(await MongoS3TTL.countDocuments()).toBe(0);
    }
  );

  it('rejects unsafe dataset cleanup scopes and ignores an empty deletion batch', async () => {
    await expect(
      mongoSessionRun((session) => createDatasetPrefixCleanup({ datasetIds: [], session }))
    ).resolves.toEqual([]);
    await expect(
      mongoSessionRun((session) => createDatasetPrefixCleanup({ datasetIds: ['../'], session }))
    ).rejects.toThrow('Invalid dataset cleanup scope');
    const { bucket } = await setup();
    const enqueue = vi.spyOn(bucket, 'addDeleteJob');
    await expect(
      enqueueS3LifecycleCleanup({
        _id: 'invalid-prefix',
        bucketName: S3Buckets.private,
        minioKey: 'dataset/',
        expiredTime: new Date(),
        cleanupType: 'datasetPrefix'
      })
    ).rejects.toThrow('Invalid dataset prefix cleanup');
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('keeps cleanup records while the bucket is unavailable', async () => {
    const { key } = await setup();
    const record = await MongoS3TTL.create({
      bucketName: S3Buckets.private,
      minioKey: key,
      expiredTime: new Date(0),
      cleanupType: 'collectionImageUpload'
    });
    global.s3BucketMap = {};
    await enqueueS3LifecycleCleanup(record.toObject());
    expect(await MongoS3TTL.findById(record._id)).toBeTruthy();
  });

  it('limits retained-dataset cleanup to owned source files and retries parsed-file deletion', async () => {
    const { scope, key: managedImageKey, bucket } = await setup();
    const source = `dataset/${scope.datasetId}/file/${'c'.repeat(32)}.pdf`;
    const parsed = `${getS3ParsedPrefix(source)}${'d'.repeat(32)}.png`;
    for (const key of [source, parsed])
      await bucket.client.uploadObject({ key, body: Buffer.from('fixture') });
    const ids = await mongoSessionRun((session) =>
      createDatasetFileCleanup({
        collections: [
          { datasetId: scope.datasetId, fileId: source },
          { datasetId: scope.datasetId, fileId: source },
          { datasetId: scope.datasetId },
          { datasetId: scope.datasetId, fileId: scope.collectionId },
          { datasetId: scope.datasetId, fileId: managedImageKey },
          { datasetId: '0'.repeat(24), fileId: source }
        ],
        session
      })
    );
    expect(ids).toHaveLength(1);
    const enqueue = vi.spyOn(bucket, 'addDeleteJob').mockResolvedValue(undefined);
    await dispatchS3LifecycleCleanup(ids);
    expect(enqueue).toHaveBeenCalledExactlyOnceWith({ key: source });
    vi.mocked(bucket.client.deleteObjectsByPrefix).mockRejectedValueOnce(
      new Error('parsed storage offline')
    );
    await expect(
      executeS3DeleteJob({ bucketName: S3Buckets.private, key: source })
    ).rejects.toThrow('parsed storage offline');
    await expect(bucket.client.getObjectMetadata({ key: source })).rejects.toThrow();
    expect(await bucket.client.getObjectMetadata({ key: parsed })).toBeTruthy();
    expect(await MongoS3TTL.findById(ids[0])).toBeTruthy();
    await executeS3DeleteJob({ bucketName: S3Buckets.private, key: source });
    await expect(bucket.client.getObjectMetadata({ key: parsed })).rejects.toThrow();
    expect(await bucket.client.getObjectMetadata({ key: managedImageKey })).toBeTruthy();
    expect(await MongoS3TTL.findById(ids[0])).toBeNull();
  });
});
