import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';

vi.unmock('@fastgpt/service/common/s3/buckets/base');
vi.unmock('@fastgpt/service/common/s3/buckets/private');

import {
  buildSandboxArchiveObjectKey,
  LEGACY_SANDBOX_ARCHIVE_PREFIX,
  SANDBOX_ARCHIVE_PREFIX,
  S3SandboxSource
} from '@fastgpt/service/common/s3/sources/sandbox';

const createMockSource = () => {
  const source = Object.create(S3SandboxSource.prototype) as S3SandboxSource & {
    client: {
      uploadObject: ReturnType<typeof vi.fn>;
      createMultipartUpload: ReturnType<typeof vi.fn>;
      uploadMultipartPart: ReturnType<typeof vi.fn>;
      completeMultipartUpload: ReturnType<typeof vi.fn>;
      abortMultipartUpload: ReturnType<typeof vi.fn>;
      downloadObject: ReturnType<typeof vi.fn>;
      deleteObjectsByPrefix: ReturnType<typeof vi.fn>;
      listObjects: ReturnType<typeof vi.fn>;
      deleteObjectsByMultiKeys: ReturnType<typeof vi.fn>;
    };
    removeObject: ReturnType<typeof vi.fn>;
  };

  Object.defineProperty(source, 'client', {
    value: {
      uploadObject: vi.fn().mockResolvedValue({ bucket: 'test-bucket', key: 'ok' }),
      createMultipartUpload: vi.fn().mockResolvedValue({
        bucket: 'test-bucket',
        key: 'ok',
        uploadId: 'upload-1'
      }),
      uploadMultipartPart: vi
        .fn()
        .mockImplementation(async ({ partNumber }: { partNumber: number }) => ({
          bucket: 'test-bucket',
          key: 'ok',
          uploadId: 'upload-1',
          partNumber,
          etag: `etag-${partNumber}`
        })),
      completeMultipartUpload: vi.fn().mockResolvedValue({ bucket: 'test-bucket', key: 'ok' }),
      abortMultipartUpload: vi.fn().mockResolvedValue({
        bucket: 'test-bucket',
        key: 'ok',
        uploadId: 'upload-1'
      }),
      downloadObject: vi.fn().mockResolvedValue({ body: Readable.from([Buffer.from('zstd')]) }),
      deleteObjectsByPrefix: vi.fn().mockResolvedValue({ deletedCount: 1 }),
      listObjects: vi.fn().mockResolvedValue({ keys: [] }),
      deleteObjectsByMultiKeys: vi.fn().mockResolvedValue({ deletedCount: 0 })
    }
  });
  source.removeObject = vi.fn().mockResolvedValue(undefined);
  return source;
};

describe('S3SandboxSource .tar.zst archive helpers', () => {
  it('builds encoded generation object keys under v2 prefix and keeps legacy prefix constant', () => {
    expect(SANDBOX_ARCHIVE_PREFIX).toBe('sandbox/archive-v2');
    expect(LEGACY_SANDBOX_ARCHIVE_PREFIX).toBe('sandbox/archive');
    expect(buildSandboxArchiveObjectKey('sandbox/a:1', 'gen123')).toBe(
      'sandbox/archive-v2/sandbox%2Fa%3A1/gen123.tar.zst'
    );
  });

  it('uploads unknown-length Readable <= 5 MiB via single uploadObject', async () => {
    const source = createMockSource();
    const partA = Buffer.alloc(2 * 1024 * 1024, 0x61);
    const partB = Buffer.alloc(1024 * 1024, 0x62);

    const result = await S3SandboxSource.prototype.uploadArchiveStream.call(source, {
      key: 'sandbox/archive-v2/sb-1/gen1.tar.zst',
      body: Readable.from([partA, partB])
    });

    expect(result).toEqual({ sizeBytes: 3 * 1024 * 1024 });
    expect(source.client.createMultipartUpload).not.toHaveBeenCalled();
    expect(source.client.uploadObject).toHaveBeenCalledTimes(1);
    const uploadedCall = source.client.uploadObject.mock.calls[0]?.[0];
    expect(uploadedCall).toMatchObject({
      key: 'sandbox/archive-v2/sb-1/gen1.tar.zst',
      contentType: 'application/zstd',
      contentLength: 3 * 1024 * 1024
    });
    expect(Buffer.isBuffer(uploadedCall?.body)).toBe(true);
    if (!Buffer.isBuffer(uploadedCall?.body)) {
      throw new Error('Expected uploadObject body to be a Buffer');
    }
    expect(uploadedCall.body.equals(Buffer.concat([partA, partB]))).toBe(true);
  });

  it('uploads unknown-length Readable > 5 MiB via multipart parts and completes', async () => {
    const source = createMockSource();
    const c1 = Buffer.alloc(3 * 1024 * 1024, 1);
    const c2 = Buffer.alloc(3 * 1024 * 1024, 2);

    const result = await S3SandboxSource.prototype.uploadArchiveStream.call(source, {
      key: 'sandbox/archive-v2/sb-1/gen2.tar.zst',
      body: Readable.from([c1, c2])
    });

    expect(result).toEqual({ sizeBytes: 6 * 1024 * 1024 });
    expect(source.client.uploadObject).not.toHaveBeenCalled();
    expect(source.client.createMultipartUpload).toHaveBeenCalledTimes(1);
    expect(source.client.uploadMultipartPart).toHaveBeenCalledTimes(2);
    expect(source.client.uploadMultipartPart).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        uploadId: 'upload-1',
        partNumber: 1,
        contentLength: 5 * 1024 * 1024
      })
    );
    expect(source.client.uploadMultipartPart).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        uploadId: 'upload-1',
        partNumber: 2,
        contentLength: 1024 * 1024
      })
    );
    expect(source.client.completeMultipartUpload).toHaveBeenCalledWith({
      key: 'sandbox/archive-v2/sb-1/gen2.tar.zst',
      uploadId: 'upload-1',
      parts: [
        { partNumber: 1, etag: 'etag-1' },
        { partNumber: 2, etag: 'etag-2' }
      ]
    });
    expect(source.client.abortMultipartUpload).not.toHaveBeenCalled();
  });

  it('aborts initiated multipart upload when streaming or part upload fails', async () => {
    const source = createMockSource();
    source.client.uploadMultipartPart.mockRejectedValueOnce(new Error('network reset'));
    const body = Readable.from([Buffer.alloc(6 * 1024 * 1024, 3)]);

    await expect(
      S3SandboxSource.prototype.uploadArchiveStream.call(source, {
        key: 'sandbox/archive-v2/sb-1/gen3.tar.zst',
        body
      })
    ).rejects.toThrow('network reset');

    expect(source.client.abortMultipartUpload).toHaveBeenCalledWith({
      key: 'sandbox/archive-v2/sb-1/gen3.tar.zst',
      uploadId: 'upload-1'
    });
    expect(source.client.completeMultipartUpload).not.toHaveBeenCalled();
  });

  it('downloads and deletes v2 prefix objects without touching legacy sandbox/archive/ prefix', async () => {
    const source = createMockSource();

    const stream = await S3SandboxSource.prototype.downloadArchiveStream.call(source, {
      key: 'sandbox/archive-v2/sb-1/gen1.tar.zst',
      sandboxId: 'sb-1'
    });
    expect(stream).toBeInstanceOf(Readable);

    await S3SandboxSource.prototype.deleteArchiveObject.call(source, {
      key: 'sandbox/archive-v2/sb-1/gen1.tar.zst'
    });
    expect(source.removeObject).toHaveBeenCalledWith('sandbox/archive-v2/sb-1/gen1.tar.zst');

    await S3SandboxSource.prototype.deleteSandboxArchives.call(source, {
      sandboxId: 'sb:1'
    });
    expect(source.client.deleteObjectsByPrefix).toHaveBeenCalledExactlyOnceWith({
      prefix: 'sandbox/archive-v2/sb%3A1/'
    });
    expect(source.removeObject).toHaveBeenCalledTimes(1);
  });

  it('deletes all superseded keys under the v2 prefix except keepObjectKey', async () => {
    const source = createMockSource();
    const keepKey = 'sandbox/archive-v2/sb%3A1/gen-new.tar.zst';
    source.client.listObjects.mockResolvedValueOnce({
      keys: [
        keepKey,
        'sandbox/archive-v2/sb%3A1/gen-old.tar.zst',
        'sandbox/archive-v2/sb%3A1/stale.tmp'
      ]
    });

    await S3SandboxSource.prototype.deleteSupersededSandboxArchives.call(source, {
      sandboxId: 'sb:1',
      keepObjectKey: keepKey
    });

    expect(source.client.listObjects).toHaveBeenCalledExactlyOnceWith({
      prefix: 'sandbox/archive-v2/sb%3A1/'
    });
    expect(source.client.deleteObjectsByMultiKeys).toHaveBeenCalledExactlyOnceWith({
      keys: ['sandbox/archive-v2/sb%3A1/gen-old.tar.zst', 'sandbox/archive-v2/sb%3A1/stale.tmp']
    });
  });

  it('rejects invalid sandboxId values for archive prefix deletion without calling S3', async () => {
    const invalidIds = ['', '   ', '.', '..', 'sb/1', 'sb\\1'];

    for (const invalidId of invalidIds) {
      const source = createMockSource();

      await expect(
        S3SandboxSource.prototype.deleteSandboxArchives.call(source, {
          sandboxId: invalidId
        })
      ).rejects.toThrow('Invalid sandboxId for archive prefix');
      await expect(
        S3SandboxSource.prototype.deleteSupersededSandboxArchives.call(source, {
          sandboxId: invalidId
        })
      ).rejects.toThrow('Invalid sandboxId for archive prefix');

      expect(source.removeObject).not.toHaveBeenCalled();
      expect(source.client.listObjects).not.toHaveBeenCalled();
      expect(source.client.deleteObjectsByPrefix).not.toHaveBeenCalled();
      expect(source.client.deleteObjectsByMultiKeys).not.toHaveBeenCalled();
    }
  });
});
