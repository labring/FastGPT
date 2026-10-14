import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createVitestStorageMock } from '@fastgpt-sdk/storage';
import { MongoS3TTL } from '@fastgpt/service/common/s3/models/ttl';

const { S3BaseBucket } = await vi.importActual<
  typeof import('@fastgpt/service/common/s3/buckets/base')
>('@fastgpt/service/common/s3/buckets/base');
const { clearExpiredMinioFiles } = await vi.importActual<
  typeof import('@fastgpt/service/common/s3/lifecycle/cleanup')
>('@fastgpt/service/common/s3/lifecycle/cleanup');

const bucketName = 'fastgpt-private';
const fileKey = 'dataset/team-1/expired-file.bin';

const createExpiredTtl = async (multipart?: { uploadId: string }) =>
  MongoS3TTL.create({
    bucketName,
    minioKey: fileKey,
    expiredTime: new Date(Date.now() - 1000),
    ...(multipart ? { multipart } : {})
  });

describe('S3 TTL cleanup', () => {
  let originalS3BucketMap: typeof global.s3BucketMap;

  beforeEach(() => {
    originalS3BucketMap = global.s3BucketMap;
  });

  afterEach(() => {
    global.s3BucketMap = originalS3BucketMap;
    vi.restoreAllMocks();
  });

  it('aborts expired Multipart parts and removes only the TTL record', async () => {
    const storage = createVitestStorageMock({ vi, bucketName });
    const bucket = new S3BaseBucket(storage, undefined);
    const upload = await storage.createMultipartUpload({ key: fileKey });
    await storage.uploadMultipartPart({
      key: fileKey,
      uploadId: upload.uploadId,
      partNumber: 1,
      body: Buffer.from('partial'),
      contentLength: 7
    });
    const addDeleteJob = vi.spyOn(bucket, 'addDeleteJob');
    await createExpiredTtl({ uploadId: upload.uploadId });
    global.s3BucketMap = { [bucketName]: bucket };

    await clearExpiredMinioFiles();

    expect(storage.abortMultipartUpload).toHaveBeenCalledWith({
      key: fileKey,
      uploadId: upload.uploadId
    });
    expect(storage.__multipartUploads.size).toBe(0);
    expect(addDeleteJob).not.toHaveBeenCalled();
    expect(await MongoS3TTL.find({ minioKey: fileKey, bucketName })).toHaveLength(0);
  });

  it('removes an expired Multipart TTL after provider-side cleanup already ran', async () => {
    const storage = createVitestStorageMock({ vi, bucketName });
    const bucket = new S3BaseBucket(storage, undefined);
    const addDeleteJob = vi.spyOn(bucket, 'addDeleteJob');
    const uploadId = 'provider-cleaned-upload';
    vi.spyOn(storage, 'abortMultipartUpload').mockRejectedValueOnce({ name: 'NoSuchUpload' });
    await createExpiredTtl({ uploadId });
    global.s3BucketMap = { [bucketName]: bucket };

    await clearExpiredMinioFiles();

    expect(storage.abortMultipartUpload).toHaveBeenCalledWith({
      key: fileKey,
      uploadId
    });
    expect(addDeleteJob).not.toHaveBeenCalled();
    expect(await MongoS3TTL.find({ minioKey: fileKey, bucketName })).toHaveLength(0);
  });

  it('keeps the Multipart TTL record when the bucket is unavailable', async () => {
    await createExpiredTtl({ uploadId: 'retry-later-upload' });
    global.s3BucketMap = {};

    await clearExpiredMinioFiles();

    expect(await MongoS3TTL.find({ minioKey: fileKey, bucketName })).toHaveLength(1);
  });

  it('submits normal expired objects for deletion and then removes their TTL record', async () => {
    const storage = createVitestStorageMock({ vi, bucketName });
    const bucket = new S3BaseBucket(storage, undefined);
    const addDeleteJob = vi.spyOn(bucket, 'addDeleteJob').mockResolvedValue(undefined);
    await createExpiredTtl();
    global.s3BucketMap = { [bucketName]: bucket };

    await clearExpiredMinioFiles();

    expect(addDeleteJob).toHaveBeenCalledWith({ key: fileKey });
    expect(await MongoS3TTL.find({ minioKey: fileKey, bucketName })).toHaveLength(0);
  });

  it('rejects a Multipart TTL without an uploadId', async () => {
    await expect(
      MongoS3TTL.create({
        bucketName,
        minioKey: fileKey,
        expiredTime: new Date(Date.now() - 1000),
        multipart: {}
      })
    ).rejects.toThrow();
  });
});
