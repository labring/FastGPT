import { describe, expect, it, vi } from 'vitest';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';

vi.unmock('@fastgpt/service/common/s3/buckets/base');

const { S3BaseBucket, isFileNotFoundError } =
  await import('@fastgpt/service/common/s3/buckets/base');

describe('S3BaseBucket file-not-found handling', () => {
  it.each([
    { name: 'AWS metadata status', error: { $metadata: { httpStatusCode: 404 } } },
    { name: 'AWS error code', error: { code: 'NotFound' } },
    { name: 'HTTP status', error: { statusCode: 404 } }
  ])('recognizes $name as a missing file', ({ error }) => {
    expect(isFileNotFoundError(error)).toBe(true);
  });

  it('converts a missing object metadata error to fileNotFound', async () => {
    const getObjectMetadata = vi.fn().mockRejectedValue({
      $metadata: { httpStatusCode: 404 }
    });
    const bucket = new S3BaseBucket({ getObjectMetadata } as any, undefined);

    await expect(bucket.getFileMetadata('dataset/file.pdf')).rejects.toBe(
      CommonErrEnum.fileNotFound
    );
  });

  it('preserves non-not-found storage errors', async () => {
    const error = new Error('storage unavailable');
    const getObjectMetadata = vi.fn().mockRejectedValue(error);
    const bucket = new S3BaseBucket({ getObjectMetadata } as any, undefined);

    await expect(bucket.getFileMetadata('dataset/file.pdf')).rejects.toBe(error);
  });
});
