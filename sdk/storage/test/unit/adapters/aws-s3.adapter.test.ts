import { PassThrough, Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { AwsS3StorageAdapter } from '../../../src/adapters/aws-s3.adapter';

const createAdapter = () =>
  new AwsS3StorageAdapter({
    vendor: 'aws-s3',
    bucket: 'fastgpt-private',
    endpoint: 'http://localhost:9000',
    region: 'us-east-1',
    forcePathStyle: true,
    maxRetries: 1,
    credentials: {
      accessKeyId: 'access-key',
      secretAccessKey: 'secret-key'
    }
  });

describe('AwsS3StorageAdapter.constructor', () => {
  it('rejects a non AWS-compatible vendor with the supported vendor list', () => {
    expect(
      () =>
        new AwsS3StorageAdapter({
          vendor: 'oss',
          bucket: 'fastgpt-private',
          endpoint: 'http://localhost:9000',
          region: 'us-east-1',
          credentials: {
            accessKeyId: 'access-key',
            secretAccessKey: 'secret-key'
          }
        } as never)
    ).toThrow('Invalid storage vendor: expected aws-s3,minio,r2');
  });
});

describe('AwsS3StorageAdapter.downloadObject', () => {
  it('rejects a pre-aborted download without dispatching an AWS request', async () => {
    const adapter = createAdapter();
    const send = vi.fn();
    (adapter as any).client.send = send;
    const controller = new AbortController();
    controller.abort();

    await expect(
      adapter.downloadObject({
        key: 'dataset/team/file.txt',
        abortSignal: controller.signal
      })
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(send).not.toHaveBeenCalled();
  });

  it('passes the caller abort signal to the AWS request handler', async () => {
    const adapter = createAdapter();
    const body = Readable.from([Buffer.from('file')]);
    const send = vi.fn().mockResolvedValue({ Body: body });
    (adapter as any).client.send = send;
    const controller = new AbortController();

    const result = await adapter.downloadObject({
      key: 'dataset/team/file.txt',
      abortSignal: controller.signal
    });

    expect(result.body).toBe(body);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        input: {
          Bucket: 'fastgpt-private',
          Key: 'dataset/team/file.txt'
        }
      }),
      { abortSignal: controller.signal }
    );
  });

  it('destroys an in-flight body with the caller abort reason', async () => {
    const adapter = createAdapter();
    const body = new PassThrough();
    (adapter as any).client.send = vi.fn().mockResolvedValue({ Body: body });
    const controller = new AbortController();
    const abortReason = new Error('client aborted');
    const result = await adapter.downloadObject({
      key: 'dataset/team/file.txt',
      abortSignal: controller.signal
    });
    result.body.on('error', () => {});

    controller.abort(abortReason);

    expect(result.body.errored).toBe(abortReason);
    expect(result.body.destroyed).toBe(true);
  });
});

describe('AwsS3StorageAdapter.multipartUpload', () => {
  it('initializes a multipart upload with object metadata', async () => {
    const adapter = createAdapter();
    const send = vi.fn().mockResolvedValue({ UploadId: 'upload-1' });
    (adapter as any).client.send = send;

    await expect(
      adapter.createMultipartUpload({
        key: 'dataset/team/file.txt',
        contentType: 'text/plain',
        contentDisposition: 'attachment; filename="file.txt"',
        metadata: { sourceFile: 'knowledge-base' }
      })
    ).resolves.toEqual({
      bucket: 'fastgpt-private',
      key: 'dataset/team/file.txt',
      uploadId: 'upload-1'
    });
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        input: {
          Bucket: 'fastgpt-private',
          Key: 'dataset/team/file.txt',
          ContentType: 'text/plain',
          ContentDisposition: 'attachment; filename="file.txt"',
          Metadata: { 'source-file': 'knowledge-base' }
        }
      })
    );
  });

  it('rejects an initialization response without an upload id', async () => {
    const adapter = createAdapter();
    const send = vi.fn().mockResolvedValue({});
    (adapter as any).client.send = send;

    await expect(adapter.createMultipartUpload({ key: 'file.txt' })).rejects.toThrow(
      'Multipart upload initialization did not return an uploadId'
    );
  });

  it('uploads a stream part with its explicit content length and returns the ETag', async () => {
    const adapter = createAdapter();
    const body = Readable.from([Buffer.from('part-body')]);
    const send = vi.fn().mockResolvedValue({ ETag: 'etag-1' });
    (adapter as any).client.send = send;

    await expect(
      adapter.uploadMultipartPart({
        key: 'dataset/team/file.txt',
        uploadId: 'upload-1',
        partNumber: 2,
        body,
        contentLength: 9
      })
    ).resolves.toEqual({
      bucket: 'fastgpt-private',
      key: 'dataset/team/file.txt',
      uploadId: 'upload-1',
      partNumber: 2,
      etag: 'etag-1'
    });
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        input: {
          Bucket: 'fastgpt-private',
          Key: 'dataset/team/file.txt',
          UploadId: 'upload-1',
          PartNumber: 2,
          Body: body,
          ContentLength: 9
        }
      })
    );
  });

  it('rejects invalid part arguments before dispatching an AWS request', async () => {
    const adapter = createAdapter();
    const send = vi.fn();
    (adapter as any).client.send = send;

    await expect(
      adapter.uploadMultipartPart({
        key: 'file.txt',
        uploadId: '',
        partNumber: 1,
        body: Buffer.from('part'),
        contentLength: 4
      })
    ).rejects.toThrow('Multipart uploadId is required');
    await expect(
      adapter.uploadMultipartPart({
        key: 'file.txt',
        uploadId: 'upload-1',
        partNumber: 0,
        body: Buffer.from('part'),
        contentLength: 4
      })
    ).rejects.toThrow('Multipart partNumber must be an integer between 1 and 10000');
    await expect(
      adapter.uploadMultipartPart({
        key: 'file.txt',
        uploadId: 'upload-1',
        partNumber: 1,
        body: Buffer.from('part'),
        contentLength: 0
      })
    ).rejects.toThrow('Multipart contentLength must be a positive integer');
    expect(send).not.toHaveBeenCalled();
  });

  it('rejects a missing part ETag', async () => {
    const adapter = createAdapter();
    const send = vi.fn().mockResolvedValue({});
    (adapter as any).client.send = send;

    await expect(
      adapter.uploadMultipartPart({
        key: 'file.txt',
        uploadId: 'upload-1',
        partNumber: 1,
        body: Buffer.from('part'),
        contentLength: 4
      })
    ).rejects.toThrow('Multipart part upload did not return an ETag');
  });

  it('completes with the validated part order', async () => {
    const adapter = createAdapter();
    const send = vi.fn().mockResolvedValue({});
    (adapter as any).client.send = send;

    await expect(
      adapter.completeMultipartUpload({
        key: 'dataset/team/file.txt',
        uploadId: 'upload-1',
        parts: [
          { partNumber: 1, etag: 'etag-1' },
          { partNumber: 2, etag: 'etag-2' }
        ]
      })
    ).resolves.toEqual({
      bucket: 'fastgpt-private',
      key: 'dataset/team/file.txt'
    });
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        input: {
          Bucket: 'fastgpt-private',
          Key: 'dataset/team/file.txt',
          UploadId: 'upload-1',
          MultipartUpload: {
            Parts: [
              { PartNumber: 1, ETag: 'etag-1' },
              { PartNumber: 2, ETag: 'etag-2' }
            ]
          }
        }
      })
    );
  });

  it('rejects unordered or duplicate parts before complete', async () => {
    const adapter = createAdapter();
    const send = vi.fn();
    (adapter as any).client.send = send;

    await expect(
      adapter.completeMultipartUpload({
        key: 'file.txt',
        uploadId: 'upload-1',
        parts: [
          { partNumber: 2, etag: 'etag-2' },
          { partNumber: 1, etag: 'etag-1' }
        ]
      })
    ).rejects.toThrow('Multipart parts must be sorted by partNumber without duplicates');
    await expect(
      adapter.completeMultipartUpload({
        key: 'file.txt',
        uploadId: 'upload-1',
        parts: [
          { partNumber: 1, etag: 'etag-1' },
          { partNumber: 1, etag: 'etag-duplicate' }
        ]
      })
    ).rejects.toThrow('Multipart parts must be sorted by partNumber without duplicates');
    expect(send).not.toHaveBeenCalled();
  });

  it('rejects empty or malformed part receipts before complete', async () => {
    const adapter = createAdapter();
    const send = vi.fn();
    (adapter as any).client.send = send;

    await expect(
      adapter.completeMultipartUpload({
        key: 'file.txt',
        uploadId: 'upload-1',
        parts: []
      })
    ).rejects.toThrow('Multipart parts are required');
    await expect(
      adapter.completeMultipartUpload({
        key: 'file.txt',
        uploadId: 'upload-1',
        parts: [{ partNumber: 1, etag: '' }]
      })
    ).rejects.toThrow('Multipart part etag is required');
    await expect(
      adapter.completeMultipartUpload({
        key: 'file.txt',
        uploadId: 'upload-1',
        parts: [null]
      } as never)
    ).rejects.toThrow('Multipart part is invalid');
    expect(send).not.toHaveBeenCalled();
  });

  it('treats NoSuchUpload abort responses as idempotent success', async () => {
    const adapter = createAdapter();
    const send = vi.fn().mockRejectedValue({ Code: 'NoSuchUpload' });
    (adapter as any).client.send = send;

    await expect(
      adapter.abortMultipartUpload({ key: 'file.txt', uploadId: 'upload-1' })
    ).resolves.toEqual({
      bucket: 'fastgpt-private',
      key: 'file.txt',
      uploadId: 'upload-1'
    });
  });

  it('propagates unexpected abort errors', async () => {
    const adapter = createAdapter();
    const error = new Error('access denied');
    const send = vi.fn().mockRejectedValue(error);
    (adapter as any).client.send = send;

    await expect(
      adapter.abortMultipartUpload({ key: 'file.txt', uploadId: 'upload-1' })
    ).rejects.toBe(error);
  });
});

describe('AwsS3StorageAdapter.deleteObjectsByPrefix', () => {
  it('rejects a whitespace-only prefix without calling S3', async () => {
    const adapter = createAdapter();
    const send = vi.fn();
    (adapter as any).client.send = send;

    await expect(adapter.deleteObjectsByPrefix({ prefix: '   ' })).rejects.toThrow(
      'Prefix is required'
    );
    expect(send).not.toHaveBeenCalled();
  });

  it('preserves failures collected before a later listing page is empty', async () => {
    const adapter = createAdapter();
    const send = vi
      .fn()
      .mockResolvedValueOnce({
        Contents: [{ Key: 'dataset/failed.txt' }],
        IsTruncated: true,
        NextContinuationToken: 'next-page'
      })
      .mockResolvedValueOnce({ Errors: [{ Key: 'dataset/failed.txt' }] })
      .mockResolvedValueOnce({ Contents: [], IsTruncated: false });
    (adapter as any).client.send = send;

    await expect(adapter.deleteObjectsByPrefix({ prefix: 'dataset/' })).resolves.toEqual({
      bucket: 'fastgpt-private',
      keys: ['dataset/failed.txt']
    });
  });
});

describe('AwsS3StorageAdapter.generatePublicGetUrl', () => {
  it.each([
    [
      { forcePathStyle: true, publicAccessExtraSubPath: undefined },
      'https://storage.example.com/fastgpt-private/folder%20name/file%20%23%2B.txt'
    ],
    [
      { forcePathStyle: true, publicAccessExtraSubPath: '/proxy/' },
      'https://storage.example.com/proxy/fastgpt-private/folder%20name/file%20%23%2B.txt'
    ],
    [
      { forcePathStyle: false, publicAccessExtraSubPath: undefined },
      'https://fastgpt-private.storage.example.com/folder%20name/file%20%23%2B.txt'
    ],
    [
      { forcePathStyle: false, publicAccessExtraSubPath: '/proxy/' },
      'https://fastgpt-private.storage.example.com/proxy/folder%20name/file%20%23%2B.txt'
    ]
  ])('encodes keys for options %j', (overrides, expectedUrl) => {
    const adapter = new AwsS3StorageAdapter({
      vendor: 'aws-s3',
      bucket: 'fastgpt-private',
      endpoint: 'https://storage.example.com',
      region: 'us-east-1',
      credentials: {
        accessKeyId: 'access-key',
        secretAccessKey: 'secret-key'
      },
      ...overrides
    });

    expect(adapter.generatePublicGetUrl({ key: 'folder name/file #+.txt' }).url).toBe(expectedUrl);
  });

  it('uses the R2 public endpoint without exposing the bucket name', () => {
    const adapter = new AwsS3StorageAdapter({
      vendor: 'r2',
      bucket: 'fastgpt-public',
      endpoint: 'https://account.r2.cloudflarestorage.com',
      publicEndpoint: 'https://assets.example.com/files/',
      region: 'auto',
      credentials: {
        accessKeyId: 'access-key',
        secretAccessKey: 'secret-key'
      }
    });

    expect(adapter.generatePublicGetUrl({ key: 'folder name/file.txt' }).url).toBe(
      'https://assets.example.com/files/folder%20name/file.txt'
    );
  });

  it('does not add AWS checksum query parameters to R2 upload signatures', async () => {
    const adapter = new AwsS3StorageAdapter({
      vendor: 'r2',
      bucket: 'fastgpt-private',
      endpoint: 'https://account.r2.cloudflarestorage.com',
      region: 'auto',
      credentials: {
        accessKeyId: 'access-key',
        secretAccessKey: 'secret-key'
      }
    });

    const result = await adapter.generatePresignedPutUrl({ key: 'file.txt' });
    expect(result.url).not.toContain('checksum');
  });

  it('does not add checksum validation parameters to R2 download signatures', async () => {
    const adapter = new AwsS3StorageAdapter({
      vendor: 'r2',
      bucket: 'fastgpt-private',
      endpoint: 'https://account.r2.cloudflarestorage.com',
      region: 'auto',
      credentials: {
        accessKeyId: 'access-key',
        secretAccessKey: 'secret-key'
      }
    });

    const result = await adapter.generatePresignedGetUrl({ key: 'file.txt' });
    expect(result.url).not.toContain('checksum');
  });

  it('rejects a public endpoint containing query or hash components', () => {
    const adapter = new AwsS3StorageAdapter({
      vendor: 'r2',
      bucket: 'fastgpt-public',
      endpoint: 'https://account.r2.cloudflarestorage.com',
      publicEndpoint: 'https://assets.example.com/files?download=1',
      region: 'auto',
      credentials: {
        accessKeyId: 'access-key',
        secretAccessKey: 'secret-key'
      }
    });

    expect(() => adapter.generatePublicGetUrl({ key: 'file.txt' })).toThrow(
      'publicEndpoint must not contain query or hash'
    );
  });
});
