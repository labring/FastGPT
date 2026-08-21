import { afterEach, describe, expect, it, vi } from 'vitest';

const loadBucketModule = async () => {
  vi.resetModules();

  const [{ S3BaseBucket }, constants] = await Promise.all([
    vi.importActual<typeof import('@fastgpt/service/common/s3/buckets/base')>(
      '@fastgpt/service/common/s3/buckets/base'
    ),
    import('@fastgpt/service/common/s3/config/constants')
  ]);

  return { S3BaseBucket, threshold: constants.S3_MULTIPART_UPLOAD_THRESHOLD_BYTES };
};

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

describe('S3BaseBucket automatic upload access URL', () => {
  it('selects Multipart for uploads at or above the threshold', async () => {
    const { S3BaseBucket, threshold } = await loadBucketModule();
    const bucket = Object.create(S3BaseBucket.prototype) as InstanceType<typeof S3BaseBucket>;
    const createPresignedPutUrl = vi.fn();
    const createMultipartUploadAccessUrl = vi.fn().mockResolvedValue({ uploadMode: 'multipart' });
    Object.assign(bucket, { createPresignedPutUrl, createMultipartUploadAccessUrl });

    const result = await bucket.createUploadAccessUrl(
      {
        rawKey: 'dataset/file.bin',
        filename: 'file.bin',
        size: threshold
      },
      { maxFileSize: 100 }
    );

    expect(result).toMatchObject({ uploadMode: 'multipart' });
    expect(createMultipartUploadAccessUrl).toHaveBeenCalledWith(
      {
        rawKey: 'dataset/file.bin',
        filename: 'file.bin',
        size: threshold
      },
      { maxFileSize: 100 }
    );
    expect(createPresignedPutUrl).not.toHaveBeenCalled();
  });

  it('keeps single PUT below the threshold or when size is unavailable', async () => {
    const { S3BaseBucket, threshold } = await loadBucketModule();
    const cases = [{ size: threshold - 1 }, { size: undefined }];

    for (const testCase of cases) {
      const bucket = Object.create(S3BaseBucket.prototype) as InstanceType<typeof S3BaseBucket>;
      const createPresignedPutUrl = vi.fn().mockResolvedValue({ uploadMode: 'single' });
      const createMultipartUploadAccessUrl = vi.fn();
      Object.assign(bucket, { createPresignedPutUrl, createMultipartUploadAccessUrl });

      await bucket.createUploadAccessUrl({
        rawKey: 'dataset/file.bin',
        filename: 'file.bin',
        ...(testCase.size === undefined ? {} : { size: testCase.size })
      });

      expect(createPresignedPutUrl).toHaveBeenCalledTimes(1);
      expect(createMultipartUploadAccessUrl).not.toHaveBeenCalled();
    }
  });
});
