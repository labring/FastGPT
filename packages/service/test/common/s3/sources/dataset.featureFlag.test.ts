import { afterEach, describe, expect, it, vi } from 'vitest';

const datasetId = '507f1f77bcf86cd799439011';

describe('S3DatasetSource Multipart capability switch', () => {
  afterEach(() => {
    vi.stubEnv('STORAGE_MULTIPART_UPLOAD_ENABLED', undefined);
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('falls back to the single PUT response when Multipart is disabled', async () => {
    vi.stubEnv('STORAGE_MULTIPART_UPLOAD_ENABLED', 'false');
    vi.resetModules();

    const { S3DatasetSource } = await vi.importActual<
      typeof import('@fastgpt/service/common/s3/sources/dataset')
    >('@fastgpt/service/common/s3/sources/dataset');
    const source = Object.create(S3DatasetSource.prototype) as InstanceType<typeof S3DatasetSource>;
    const createPresignedPutUrl = vi.fn().mockResolvedValue({ uploadMode: 'single' });
    const createMultipartUploadAccessUrl = vi.fn();
    Object.assign(source, { createPresignedPutUrl, createMultipartUploadAccessUrl });

    await expect(
      source.createUploadDatasetFileURL({
        filename: 'file.pdf',
        datasetId,
        size: 64 * 1024 * 1024,
        maxFileSize: 100
      })
    ).resolves.toMatchObject({ uploadMode: 'single' });

    expect(createMultipartUploadAccessUrl).not.toHaveBeenCalled();
    expect(createPresignedPutUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: 'file.pdf',
        size: 64 * 1024 * 1024,
        source: 'local-file'
      }),
      expect.any(Object)
    );
  });
});
