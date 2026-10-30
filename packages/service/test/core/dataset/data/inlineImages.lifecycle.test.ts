import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoS3TTL } from '@fastgpt/service/common/s3/models/ttl';
import { S3Buckets } from '@fastgpt/service/common/s3/config/constants';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import {
  claimDatasetInlineImageCleanup,
  persistDatasetDataImages
} from '@fastgpt/service/core/dataset/data/inlineImages/entity';
import { removeS3TTL } from '@fastgpt/service/common/s3/utils';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { clearExpiredMinioFiles } from '@fastgpt/service/common/s3/lifecycle/cleanup';

vi.unmock('@fastgpt/service/common/mongo/sessionRun');
vi.unmock('@fastgpt/service/common/s3/queue/delete');
const { executeS3DeleteJob } = await import('@fastgpt/service/common/s3/queue/delete');

const teamId = '507f1f77bcf86cd799439013';
const tmbId = '507f1f77bcf86cd799439014';
const datasetId = '507f1f77bcf86cd799439011';
const collectionId = '507f1f77bcf86cd799439012';
const key = `dataset/${datasetId}/inline-images/file/${'a'.repeat(32)}.png`;
const bucketName = S3Buckets.private;

const createRecord = () =>
  MongoS3TTL.create({
    minioKey: key,
    bucketName,
    expiredTime: new Date(0),
    datasetInlineImage: { teamId, datasetId }
  });
const createData = (q: string) =>
  MongoDatasetData.create({ teamId, tmbId, datasetId, collectionId, q });
const expire = () =>
  MongoS3TTL.updateMany({ minioKey: key }, { $set: { expiredTime: new Date(0) } });

describe('dataset inline image lifecycle', () => {
  let previousBuckets: typeof global.s3BucketMap;
  const addDeleteJob = vi.fn();
  const deleteObjectsByMultiKeys = vi.fn();
  const deleteObjectsByPrefix = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    addDeleteJob.mockResolvedValue(undefined);
    deleteObjectsByMultiKeys.mockResolvedValue({ keys: [] });
    deleteObjectsByPrefix.mockResolvedValue({ keys: [] });
    previousBuckets = global.s3BucketMap;
    global.s3BucketMap = {
      [bucketName]: {
        addDeleteJob,
        client: { deleteObjectsByMultiKeys, deleteObjectsByPrefix }
      }
    } as any;
  });
  afterEach(() => {
    global.s3BucketMap = previousBuckets;
  });

  it('keeps a shared key until the last chunk is deleted, then completes physical deletion', async () => {
    await createRecord();
    const first = await createData(`![one](${key})`);
    const second = await createData(`<img src="${key}">`);
    await MongoDatasetData.deleteOne({ _id: first._id });
    await clearExpiredMinioFiles();
    expect(addDeleteJob).not.toHaveBeenCalled();
    expect(await MongoS3TTL.findOne({ minioKey: key }).lean()).toMatchObject({
      datasetInlineImage: { cleanupPending: false }
    });

    await MongoDatasetData.deleteOne({ _id: second._id });
    await expire();
    await clearExpiredMinioFiles();
    expect(addDeleteJob).toHaveBeenCalledWith({ key });
    expect(await MongoS3TTL.countDocuments({ minioKey: key })).toBe(1);
    await executeS3DeleteJob({ bucketName, key });
    expect(deleteObjectsByMultiKeys).toHaveBeenCalledWith({ keys: [key] });
    expect(await MongoS3TTL.countDocuments({ minioKey: key })).toBe(0);
  });

  it('keeps pending QA references and reclaims images after the task is removed', async () => {
    await createRecord();
    const training = await MongoDatasetTraining.create({
      teamId,
      tmbId,
      datasetId,
      collectionId,
      billId: 'test',
      mode: 'qa',
      q: `![pending](${key})`
    });
    await clearExpiredMinioFiles();
    expect(addDeleteJob).not.toHaveBeenCalled();
    await MongoDatasetTraining.deleteOne({ _id: training._id });
    await expire();
    await clearExpiredMinioFiles();
    expect(addDeleteJob).toHaveBeenCalledWith({ key });
  });

  it('retains historical references and collects a removed final image reference', async () => {
    await createRecord();
    const data = await createData('updated text');
    await MongoDatasetData.updateOne(
      { _id: data._id },
      { history: [{ q: `old ![image](${key})`, updateTime: new Date() }] }
    );
    await clearExpiredMinioFiles();
    expect(addDeleteJob).not.toHaveBeenCalled();
    await MongoDatasetData.updateOne({ _id: data._id }, { history: [] });
    await expire();
    await clearExpiredMinioFiles();
    expect(addDeleteJob).toHaveBeenCalledWith({ key });
  });

  it('does not delete active managed images through direct or stale delete jobs', async () => {
    await createRecord();
    await createData(`![image](${key})`);
    await executeS3DeleteJob({ bucketName, key });
    expect(deleteObjectsByMultiKeys).not.toHaveBeenCalled();
    expect(await MongoS3TTL.countDocuments()).toBe(1);
  });

  it.each(
    (
      [
        'q',
        'a',
        'history.q',
        'history.a',
        'indexes',
        'training.q',
        'training.a',
        'training.indexes'
      ] as const
    ).flatMap((target) => (['image', 'link'] as const).map((syntax) => ({ target, syntax })))
  )(
    'retains escaped Markdown $syntax references in $target until the final reference disappears',
    async ({ target, syntax }) => {
      await createRecord();
      const text =
        syntax === 'image'
          ? `![image](${key.replace(/[./-]/g, '\\$&')})`
          : `[view](${key.replace('.png', '\\.png')})`;
      // 与写入侧使用相同的实际引用获取路径，正文仍保留 Markdown 转义。
      await mongoSessionRun(async (session) => {
        await persistDatasetDataImages({ teamId, datasetId, data: [{ q: text }], session });
        if (target.startsWith('training.')) {
          await MongoDatasetTraining.create(
            [
              {
                teamId,
                tmbId,
                datasetId,
                collectionId,
                billId: 'test',
                mode: 'qa',
                ...(target === 'training.indexes'
                  ? { q: 'current text', indexes: [{ type: 'custom', text }] }
                  : { [target.slice(9)]: text })
              }
            ],
            { session }
          );
        } else {
          await MongoDatasetData.create(
            [
              {
                teamId,
                tmbId,
                datasetId,
                collectionId,
                ...(target.startsWith('history.')
                  ? {
                      q: 'current text',
                      history: [{ [target.slice(8)]: text, updateTime: new Date() }]
                    }
                  : target === 'indexes'
                    ? { q: 'current text', indexes: [{ type: 'custom', text, dataId: 'test' }] }
                    : { [target]: text })
              }
            ],
            { session }
          );
        }
      });

      await expire();
      await clearExpiredMinioFiles();
      await executeS3DeleteJob({ bucketName, key });
      expect(addDeleteJob).not.toHaveBeenCalled();
      expect(deleteObjectsByMultiKeys).not.toHaveBeenCalled();
      expect(await MongoS3TTL.findOne({ minioKey: key }).lean()).toMatchObject({
        datasetInlineImage: { cleanupPending: false }
      });

      await MongoDatasetData.deleteMany({});
      await MongoDatasetTraining.deleteMany({});
      await expire();
      await clearExpiredMinioFiles();
      await executeS3DeleteJob({ bucketName, key });
      expect(deleteObjectsByMultiKeys).toHaveBeenCalledWith({ keys: [key] });
      expect(await MongoS3TTL.countDocuments({ minioKey: key })).toBe(0);
    }
  );

  it('does not retain an image merely because another key contains the same random filename', async () => {
    await createRecord();
    await createData(`![other](${key.replace('/file/', '/other/').replace(/[./-]/g, '\\$&')})`);
    await clearExpiredMinioFiles();
    expect(addDeleteJob).toHaveBeenCalledWith({ key });
    await executeS3DeleteJob({ bucketName, key });
    expect(deleteObjectsByMultiKeys).toHaveBeenCalledWith({ keys: [key] });
    expect(await MongoS3TTL.countDocuments({ minioKey: key })).toBe(0);
  });

  it('rejects new references after cleanup is claimed and retries failed storage deletion', async () => {
    await createRecord();
    await clearExpiredMinioFiles();
    await expect(
      mongoSessionRun((session) =>
        persistDatasetDataImages({
          teamId,
          datasetId,
          data: [{ q: `![image](${key})` }],
          session
        })
      )
    ).rejects.toThrow('Inline image is no longer available');
    deleteObjectsByMultiKeys.mockRejectedValueOnce(new Error('storage unavailable'));
    await expect(executeS3DeleteJob({ bucketName, key })).rejects.toThrow('storage unavailable');
    expect(await MongoS3TTL.countDocuments()).toBe(1);
    await executeS3DeleteJob({ bucketName, key });
    expect(await MongoS3TTL.countDocuments()).toBe(0);
  });

  it('keeps ownership when queue submission fails or the bucket is unavailable', async () => {
    await createRecord();
    global.s3BucketMap = {};
    await clearExpiredMinioFiles();
    expect(await MongoS3TTL.countDocuments()).toBe(1);
    global.s3BucketMap = { [bucketName]: { addDeleteJob } } as any;
    addDeleteJob.mockRejectedValueOnce(new Error('queue unavailable'));
    await clearExpiredMinioFiles();
    expect(await MongoS3TTL.countDocuments()).toBe(1);
    addDeleteJob.mockClear();
    await clearExpiredMinioFiles();
    expect(addDeleteJob).toHaveBeenCalledWith({ key });
  });

  it('ignores stale expiry snapshots after a writer renewed the same ownership record', async () => {
    const file = await createRecord();
    await mongoSessionRun((session) =>
      persistDatasetDataImages({
        teamId,
        datasetId,
        data: [{ q: `![image](${key})` }],
        session
      })
    );
    expect(await claimDatasetInlineImageCleanup(file.toObject())).toBe(false);
    const renewed = await MongoS3TTL.findOne({ minioKey: key }).lean();
    expect(await claimDatasetInlineImageCleanup(renewed!)).toBe(false);
    expect(await MongoS3TTL.findOne({ minioKey: key }).lean()).toMatchObject({
      datasetInlineImage: { cleanupPending: false }
    });
  });

  it('does not drop the ownership record through ordinary imageId TTL cleanup', async () => {
    await createRecord();
    await removeS3TTL({ key, bucketName: 'private' });
    await removeS3TTL({ key: [key], bucketName: 'private' });
    expect(await MongoS3TTL.countDocuments()).toBe(1);
  });

  it('keeps invalid ownership metadata for investigation rather than deleting another dataset key', async () => {
    await createRecord();
    await MongoS3TTL.updateOne(
      { minioKey: key },
      { 'datasetInlineImage.datasetId': '507f1f77bcf86cd799439099' }
    );
    await clearExpiredMinioFiles();
    expect(addDeleteJob).not.toHaveBeenCalled();
    expect(await MongoS3TTL.countDocuments()).toBe(1);
  });
});
