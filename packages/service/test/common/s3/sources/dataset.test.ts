import { afterAll, describe, expect, it, vi } from 'vitest';

const originalMultipartEnabled = process.env.STORAGE_MULTIPART_UPLOAD_ENABLED;
vi.resetModules();
vi.stubEnv('STORAGE_MULTIPART_UPLOAD_ENABLED', 'true');

const { S3_MULTIPART_UPLOAD_THRESHOLD_BYTES } = await vi.importActual<
  typeof import('@fastgpt/service/common/s3/config/constants')
>('@fastgpt/service/common/s3/config/constants');

const { S3DatasetSource } = await vi.importActual<
  typeof import('@fastgpt/service/common/s3/sources/dataset')
>('@fastgpt/service/common/s3/sources/dataset');

afterAll(() => {
  vi.stubEnv('STORAGE_MULTIPART_UPLOAD_ENABLED', originalMultipartEnabled);
});

const datasetId = '507f1f77bcf86cd799439011';

const createSourceWithUploadMocks = () => {
  const source = Object.create(S3DatasetSource.prototype) as InstanceType<typeof S3DatasetSource>;
  const createPresignedPutUrl = vi.fn().mockResolvedValue({ uploadMode: 'single' });
  const createMultipartUploadAccessUrl = vi.fn().mockResolvedValue({ uploadMode: 'multipart' });

  Object.assign(source, {
    createPresignedPutUrl,
    createMultipartUploadAccessUrl
  });

  return { source, createPresignedPutUrl, createMultipartUploadAccessUrl };
};

describe('S3DatasetSource upload mode selection', () => {
  it('keeps small files and legacy calls on the single PUT path', async () => {
    const { source, createPresignedPutUrl, createMultipartUploadAccessUrl } =
      createSourceWithUploadMocks();

    await source.createUploadDatasetFileURL({
      filename: 'file.pdf',
      datasetId,
      size: S3_MULTIPART_UPLOAD_THRESHOLD_BYTES - 1,
      maxFileSize: 100
    });

    expect(createMultipartUploadAccessUrl).not.toHaveBeenCalled();
    expect(createPresignedPutUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: 'file.pdf',
        size: S3_MULTIPART_UPLOAD_THRESHOLD_BYTES - 1,
        source: 'local-file'
      }),
      expect.objectContaining({
        expiredHours: 3,
        maxFileSize: 100,
        uploadPolicy: expect.objectContaining({
          defaultContentType: expect.any(String),
          allowedExtensions: expect.any(Array)
        })
      })
    );
  });

  it('initializes Multipart for files at the threshold and preserves the same key policy', async () => {
    const { source, createPresignedPutUrl, createMultipartUploadAccessUrl } =
      createSourceWithUploadMocks();

    await source.createUploadDatasetFileURL({
      filename: 'file.pdf',
      datasetId,
      size: S3_MULTIPART_UPLOAD_THRESHOLD_BYTES,
      maxFileSize: 100
    });

    expect(createPresignedPutUrl).not.toHaveBeenCalled();
    expect(createMultipartUploadAccessUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        rawKey: expect.stringMatching(/^dataset\/507f1f77bcf86cd799439011\//),
        filename: 'file.pdf',
        size: S3_MULTIPART_UPLOAD_THRESHOLD_BYTES,
        source: 'local-file'
      }),
      expect.objectContaining({
        expiredHours: 3,
        maxFileSize: 100,
        uploadPolicy: expect.objectContaining({
          defaultContentType: expect.any(String),
          allowedExtensions: expect.any(Array)
        })
      })
    );
  });
});
