import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Readable } from 'node:stream';

vi.resetModules();

const { S3_MULTIPART_UPLOAD_THRESHOLD_BYTES } = await vi.importActual<
  typeof import('@fastgpt/service/common/s3/config/constants')
>('@fastgpt/service/common/s3/config/constants');

const { S3DatasetSource } = await vi.importActual<
  typeof import('@fastgpt/service/common/s3/sources/dataset')
>('@fastgpt/service/common/s3/sources/dataset');
const { MongoS3TTL } = await vi.importActual<
  typeof import('@fastgpt/service/common/s3/models/ttl')
>('@fastgpt/service/common/s3/models/ttl');

const datasetId = '507f1f77bcf86cd799439011';

const createSourceWithUploadMocks = () => {
  const source = Object.create(S3DatasetSource.prototype) as InstanceType<typeof S3DatasetSource>;
  const createUploadAccessUrl = vi.fn().mockResolvedValue({ uploadMode: 'single' });

  Object.assign(source, { createUploadAccessUrl });

  return { source, createUploadAccessUrl };
};

describe('S3DatasetSource upload access parameters', () => {
  it('passes the file size and dataset policy to the shared upload selector', async () => {
    const { source, createUploadAccessUrl } = createSourceWithUploadMocks();

    await source.createUploadDatasetFileURL({
      filename: 'file.pdf',
      datasetId,
      size: S3_MULTIPART_UPLOAD_THRESHOLD_BYTES - 1,
      maxFileSize: 100
    });

    expect(createUploadAccessUrl).toHaveBeenCalledWith(
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

  it('keeps the automatic selector compatible with calls without a size hint', async () => {
    const { source, createUploadAccessUrl } = createSourceWithUploadMocks();

    await source.createUploadDatasetFileURL({
      filename: 'file.pdf',
      datasetId,
      maxFileSize: 100
    });

    expect(createUploadAccessUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        rawKey: expect.stringMatching(/^dataset\/507f1f77bcf86cd799439011\//),
        filename: 'file.pdf',
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

describe('S3DatasetSource FileSource lifecycle', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('HEAD 后返回可信 S3 source，直到物化时才打开对象流', async () => {
    const source = Object.create(S3DatasetSource.prototype) as InstanceType<typeof S3DatasetSource>;
    const key = `dataset/${datasetId}/file.pdf`;
    const getFileMetadata = vi.fn().mockResolvedValue({
      filename: 'file.pdf',
      extension: 'pdf',
      contentType: 'application/pdf',
      contentLength: 3
    });
    const getFileStream = vi.fn().mockResolvedValue(Readable.from([Buffer.from('pdf')]));
    Object.assign(source, { getFileMetadata, getFileStream });

    const fileSource = await source.getDatasetFileSource({ fileId: key, datasetId });
    expect(fileSource).toMatchObject({
      kind: 's3',
      sizeBytes: 3,
      metadata: {
        filename: 'file.pdf',
        extension: 'pdf',
        contentType: 'application/pdf'
      }
    });
    expect(getFileStream).not.toHaveBeenCalled();

    const controller = new AbortController();
    await expect(fileSource.materialize({ signal: controller.signal })).resolves.toMatchObject({
      buffer: Buffer.from('pdf')
    });
    expect(getFileStream).toHaveBeenCalledWith(key, { abortSignal: controller.signal });
  });

  it('拒绝缺失 Content-Length 的 S3 metadata', async () => {
    const source = Object.create(S3DatasetSource.prototype) as InstanceType<typeof S3DatasetSource>;
    Object.assign(source, {
      getFileMetadata: vi.fn().mockResolvedValue({ filename: 'file.pdf' })
    });

    await expect(
      source.getDatasetFileSource({
        fileId: `dataset/${datasetId}/file.pdf`,
        datasetId
      })
    ).rejects.toThrow('metadata');
  });

  it('失败对象先物理删除，确认成功后再移除保护 TTL', async () => {
    const source = Object.create(S3DatasetSource.prototype) as InstanceType<typeof S3DatasetSource>;
    const removeObject = vi.fn().mockResolvedValue(undefined);
    Object.assign(source, { removeObject });
    Object.defineProperty(source, 'bucketName', { value: 'private' });
    const deleteTtl = vi.spyOn(MongoS3TTL, 'deleteOne').mockResolvedValue({} as any);

    await source.cleanupPendingDatasetFile('dataset/id/file.csv');

    expect(removeObject).toHaveBeenCalledWith('dataset/id/file.csv');
    expect(deleteTtl).toHaveBeenCalledWith({
      minioKey: 'dataset/id/file.csv',
      bucketName: 'private'
    });
    expect(removeObject.mock.invocationCallOrder[0]).toBeLessThan(
      deleteTtl.mock.invocationCallOrder[0]
    );
    deleteTtl.mockRestore();
  });

  it('物理删除失败时保留 TTL', async () => {
    const source = Object.create(S3DatasetSource.prototype) as InstanceType<typeof S3DatasetSource>;
    Object.assign(source, {
      removeObject: vi.fn().mockRejectedValue(new Error('delete failed'))
    });
    Object.defineProperty(source, 'bucketName', { value: 'private' });
    const deleteTtl = vi.spyOn(MongoS3TTL, 'deleteOne').mockResolvedValue({} as any);

    await expect(source.cleanupPendingDatasetFile('dataset/id/file.csv')).rejects.toThrow(
      'delete failed'
    );
    expect(deleteTtl).not.toHaveBeenCalled();
    deleteTtl.mockRestore();
  });
});
