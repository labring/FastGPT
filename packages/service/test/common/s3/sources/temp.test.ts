import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.resetModules();

const { S3TempFileSource } = await vi.importActual<
  typeof import('@fastgpt/service/common/s3/sources/temp')
>('@fastgpt/service/common/s3/sources/temp');
const { MongoS3TTL } = await vi.importActual<
  typeof import('@fastgpt/service/common/s3/models/ttl')
>('@fastgpt/service/common/s3/models/ttl');

describe('S3TempFileSource', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('上传完成后返回可信 S3 source，并延迟到物化时才打开下载流', async () => {
    const bucket = Object.create(S3TempFileSource.prototype) as InstanceType<
      typeof S3TempFileSource
    >;
    const uploadFileByBody = vi.fn().mockResolvedValue({});
    const getFileStream = vi.fn().mockResolvedValue(Readable.from([Buffer.from('a,b\n1,2')]));
    Object.assign(bucket, { uploadFileByBody, getFileStream });

    const input = Readable.from([Buffer.from('a,b\n1,2')]);
    const result = await bucket.upload({
      teamId: 'team-1',
      stream: input,
      sizeBytes: 7,
      filename: 'evaluation.csv',
      contentType: 'text/csv',
      encoding: '7bit'
    });

    expect(result.key).toMatch(/^temp\/team-1\//);
    expect(uploadFileByBody).toHaveBeenCalledWith(
      expect.objectContaining({
        key: result.key,
        body: input,
        filename: 'evaluation.csv',
        contentType: 'text/csv',
        contentLength: 7
      })
    );
    expect(result.source).toMatchObject({
      kind: 's3',
      sizeBytes: 7,
      metadata: {
        filename: 'evaluation.csv',
        contentType: 'text/csv',
        encoding: '7bit'
      }
    });
    expect(getFileStream).not.toHaveBeenCalled();

    const controller = new AbortController();
    await expect(result.source.materialize({ signal: controller.signal })).resolves.toMatchObject({
      buffer: Buffer.from('a,b\n1,2')
    });
    expect(getFileStream).toHaveBeenCalledWith(result.key, {
      abortSignal: controller.signal
    });
  });

  it('确认对象删除成功后再移除 TTL', async () => {
    const bucket = Object.create(S3TempFileSource.prototype) as InstanceType<
      typeof S3TempFileSource
    >;
    const removeObject = vi.fn().mockResolvedValue(undefined);
    Object.assign(bucket, { removeObject });
    Object.defineProperty(bucket, 'bucketName', { value: 'fastgpt-private' });
    const deleteTtl = vi.spyOn(MongoS3TTL, 'deleteOne').mockResolvedValue({} as never);

    await bucket.cleanup('temp/team-1/file.csv');

    expect(removeObject).toHaveBeenCalledWith('temp/team-1/file.csv');
    expect(deleteTtl).toHaveBeenCalledWith({
      minioKey: 'temp/team-1/file.csv',
      bucketName: 'fastgpt-private'
    });
    expect(removeObject.mock.invocationCallOrder[0]).toBeLessThan(
      deleteTtl.mock.invocationCallOrder[0]
    );
  });

  it('对象删除失败时保留 TTL', async () => {
    const bucket = Object.create(S3TempFileSource.prototype) as InstanceType<
      typeof S3TempFileSource
    >;
    Object.assign(bucket, {
      removeObject: vi.fn().mockRejectedValue(new Error('delete failed'))
    });
    Object.defineProperty(bucket, 'bucketName', { value: 'fastgpt-private' });
    const deleteTtl = vi.spyOn(MongoS3TTL, 'deleteOne').mockResolvedValue({} as never);

    await expect(bucket.cleanup('temp/team-1/file.csv')).rejects.toThrow('delete failed');
    expect(deleteTtl).not.toHaveBeenCalled();
  });
});
