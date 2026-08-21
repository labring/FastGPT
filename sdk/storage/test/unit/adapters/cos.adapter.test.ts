import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CosStorageAdapter } from '../../../src/adapters/cos.adapter';

const createAdapter = () =>
  new CosStorageAdapter({
    vendor: 'cos',
    bucket: 'fastgpt-private',
    region: 'ap-guangzhou',
    credentials: {
      accessKeyId: 'secret-id',
      secretAccessKey: 'secret-key'
    }
  });

describe('CosStorageAdapter.constructor', () => {
  it('rejects a non-COS vendor', () => {
    expect(
      () =>
        new CosStorageAdapter({
          vendor: 'oss',
          bucket: 'fastgpt-private',
          region: 'ap-guangzhou',
          credentials: {
            accessKeyId: 'secret-id',
            secretAccessKey: 'secret-key'
          }
        } as never)
    ).toThrow('Invalid storage vendor: expected "cos"');
  });
});

describe('CosStorageAdapter.multipartUpload', () => {
  it('maps multipart uploads to COS', async () => {
    const adapter = createAdapter();
    const multipartInit = vi.fn((_params, callback) => {
      callback(null, { UploadId: 'cos-upload-1' });
    });
    const multipartUpload = vi.fn((_params, callback) => {
      callback(null, { ETag: 'cos-etag-1' });
    });
    const multipartComplete = vi.fn((_params, callback) => {
      callback(null, { ETag: 'cos-final-etag' });
    });
    const multipartAbort = vi.fn((_params, callback) => {
      callback(null, {});
    });
    Object.assign((adapter as any).client, {
      multipartInit,
      multipartUpload,
      multipartComplete,
      multipartAbort
    });

    await expect(
      adapter.createMultipartUpload({
        key: 'dataset/file.txt',
        contentType: 'text/plain',
        contentDisposition: 'attachment; filename="file.txt"',
        metadata: { sourceFile: 'dataset' }
      })
    ).resolves.toEqual({
      bucket: 'fastgpt-private',
      key: 'dataset/file.txt',
      uploadId: 'cos-upload-1'
    });
    await expect(
      adapter.uploadMultipartPart({
        key: 'dataset/file.txt',
        uploadId: 'cos-upload-1',
        partNumber: 1,
        body: Buffer.from('part'),
        contentLength: 4
      })
    ).resolves.toMatchObject({ etag: 'cos-etag-1', partNumber: 1 });
    await adapter.completeMultipartUpload({
      key: 'dataset/file.txt',
      uploadId: 'cos-upload-1',
      parts: [{ partNumber: 1, etag: 'cos-etag-1' }]
    });
    await adapter.abortMultipartUpload({ key: 'dataset/file.txt', uploadId: 'cos-upload-1' });

    expect(multipartInit).toHaveBeenCalledWith(
      {
        Bucket: 'fastgpt-private',
        Region: 'ap-guangzhou',
        Key: 'dataset/file.txt',
        ContentType: 'text/plain',
        Headers: {
          'Content-Disposition': 'attachment; filename="file.txt"',
          'x-cos-meta-source-file': 'dataset'
        }
      },
      expect.any(Function)
    );
    expect(multipartUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        Bucket: 'fastgpt-private',
        Region: 'ap-guangzhou',
        Key: 'dataset/file.txt',
        UploadId: 'cos-upload-1',
        PartNumber: 1,
        ContentLength: 4
      }),
      expect.any(Function)
    );
    expect(multipartComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        Bucket: 'fastgpt-private',
        Region: 'ap-guangzhou',
        Key: 'dataset/file.txt',
        UploadId: 'cos-upload-1',
        Parts: [{ PartNumber: 1, ETag: 'cos-etag-1' }]
      }),
      expect.any(Function)
    );
    expect(multipartAbort).toHaveBeenCalledWith(
      expect.objectContaining({
        Bucket: 'fastgpt-private',
        Region: 'ap-guangzhou',
        Key: 'dataset/file.txt',
        UploadId: 'cos-upload-1'
      }),
      expect.any(Function)
    );
  });

  it('passes an empty header object when multipart initialization has no custom headers', async () => {
    const adapter = createAdapter();
    const multipartInit = vi.fn((_params, callback) => {
      callback(null, { UploadId: 'cos-upload-empty-headers' });
    });
    (adapter as any).client.multipartInit = multipartInit;

    await expect(
      adapter.createMultipartUpload({
        key: 'dataset/file.txt'
      })
    ).resolves.toMatchObject({ uploadId: 'cos-upload-empty-headers' });

    expect(multipartInit).toHaveBeenCalledWith(
      {
        Bucket: 'fastgpt-private',
        Region: 'ap-guangzhou',
        Key: 'dataset/file.txt',
        ContentType: undefined,
        Headers: {}
      },
      expect.any(Function)
    );
  });

  it('rejects an invalid part before calling COS', async () => {
    const adapter = createAdapter();
    const multipartUpload = vi.fn();
    (adapter as any).client.multipartUpload = multipartUpload;

    await expect(
      adapter.uploadMultipartPart({
        key: 'dataset/file.txt',
        uploadId: 'cos-upload-1',
        partNumber: 1,
        body: Buffer.from('part'),
        contentLength: 0
      })
    ).rejects.toThrow('Multipart contentLength must be a positive integer');
    expect(multipartUpload).not.toHaveBeenCalled();
  });
});

describe('CosStorageAdapter error normalization', () => {
  it.each([
    ['a string error', 'request failed'],
    ['a plain object error', { statusCode: 500, message: 'request failed' }]
  ])('normalizes %s without reading properties from unknown', async (_case, error) => {
    const adapter = createAdapter();
    (adapter as any).client.headObject = vi.fn(
      (_params: unknown, callback: (error: unknown, result: unknown) => void) => {
        callback(error, undefined);
      }
    );

    await expect(adapter.checkObjectExists({ key: 'dataset/file.txt' })).rejects.toMatchObject({
      message: typeof error === 'string' ? 'Unknown COS error' : 'request failed'
    });
  });
});

describe('CosStorageAdapter.generatePresignedGetUrl', () => {
  const getObjectUrlMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    getObjectUrlMock.mockImplementation((params, callback) => {
      callback(null, {
        Url: `https://cos.example.com/${params.Key}`
      });
    });
  });

  it('maps response content type overrides to COS query params', async () => {
    const adapter = createAdapter();
    (adapter as any).client.getObjectUrl = getObjectUrlMock;

    await adapter.generatePresignedGetUrl({
      key: 'dataset/team/aaa.md',
      expiredSeconds: 300,
      responseContentType: 'text/markdown; charset=utf-8'
    });

    expect(getObjectUrlMock).toHaveBeenCalledWith(
      expect.objectContaining({
        Bucket: 'fastgpt-private',
        Region: 'ap-guangzhou',
        Key: 'dataset/team/aaa.md',
        Expires: 300,
        Sign: true,
        Method: 'GET',
        Query: {
          'response-content-type': 'text/markdown; charset=utf-8'
        }
      }),
      expect.any(Function)
    );
  });
});

describe('CosStorageAdapter.downloadObject', () => {
  it('rejects a pre-aborted download without requesting the object', async () => {
    const adapter = createAdapter();
    const getObject = vi.fn();
    (adapter as any).client.getObject = getObject;
    const controller = new AbortController();
    controller.abort();

    await expect(
      adapter.downloadObject({
        key: 'dataset/team/file.txt',
        abortSignal: controller.signal
      })
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(getObject).not.toHaveBeenCalled();
  });

  it('destroys the output stream when the caller aborts the download', async () => {
    const adapter = createAdapter();
    (adapter as any).client.headObject = vi.fn(
      (_params: unknown, callback: (error: unknown, result: unknown) => void) => {
        callback(null, {});
      }
    );
    (adapter as any).client.getObject = vi.fn();
    const controller = new AbortController();

    const { body } = await adapter.downloadObject({
      key: 'dataset/team/file.txt',
      abortSignal: controller.signal
    });
    const abortReason = new Error('client aborted');
    body.on('error', () => {});
    controller.abort(abortReason);

    expect(body.errored).toBe(abortReason);
    expect(body.destroyed).toBe(true);
  });
});

describe('CosStorageAdapter deletion boundaries', () => {
  it('treats an empty key list as a no-op', async () => {
    const adapter = createAdapter();
    const deleteMultipleObject = vi.fn();
    (adapter as any).client.deleteMultipleObject = deleteMultipleObject;

    await expect(adapter.deleteObjectsByMultiKeys({ keys: [] })).resolves.toEqual({
      bucket: 'fastgpt-private',
      keys: []
    });
    expect(deleteMultipleObject).not.toHaveBeenCalled();
  });

  it('splits multi-delete requests at the COS 1000-object limit', async () => {
    const adapter = createAdapter();
    const keys = Array.from({ length: 1001 }, (_, index) => `dataset/file-${index}.txt`);
    const deleteMultipleObject = vi.fn().mockImplementation((params, callback) => {
      callback(null, {
        Error: [],
        Deleted: params.Objects
      });
    });
    (adapter as any).client.deleteMultipleObject = deleteMultipleObject;

    await expect(adapter.deleteObjectsByMultiKeys({ keys })).resolves.toEqual({
      bucket: 'fastgpt-private',
      keys: []
    });
    expect(deleteMultipleObject).toHaveBeenCalledTimes(2);
    expect(deleteMultipleObject).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ Objects: keys.slice(0, 1000).map((Key) => ({ Key })) }),
      expect.any(Function)
    );
    expect(deleteMultipleObject).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ Objects: keys.slice(1000).map((Key) => ({ Key })) }),
      expect.any(Function)
    );
  });

  it('rejects a whitespace-only prefix without listing objects', async () => {
    const adapter = createAdapter();
    const getBucket = vi.fn();
    (adapter as any).client.getBucket = getBucket;

    await expect(adapter.deleteObjectsByPrefix({ prefix: '   ' })).rejects.toThrow(
      'Prefix is required'
    );
    expect(getBucket).not.toHaveBeenCalled();
  });
});

describe('CosStorageAdapter.deleteObjectsByRawKeys', () => {
  it('routes control-character keys through single-object delete and the rest through XML batch delete', async () => {
    const adapter = createAdapter();
    const deleteObject = vi.fn().mockImplementation((_params, callback) => callback(null, {}));
    const deleteMultipleObject = vi.fn().mockImplementation((params, callback) => {
      callback(null, { Error: [], Deleted: params.Objects });
    });
    Object.assign((adapter as any).client, { deleteObject, deleteMultipleObject });

    const legacyKey = 'chat/app/legacy\r\nname.svg';
    const safeKey = 'dataset/team/file.txt';

    await expect(adapter.deleteObjectsByRawKeys({ keys: [legacyKey, safeKey] })).resolves.toEqual({
      bucket: 'fastgpt-private',
      keys: []
    });

    expect(deleteObject).toHaveBeenCalledTimes(1);
    expect(deleteObject).toHaveBeenCalledWith(
      expect.objectContaining({
        Bucket: 'fastgpt-private',
        Region: 'ap-guangzhou',
        Key: legacyKey
      }),
      expect.any(Function)
    );
    expect(deleteMultipleObject).toHaveBeenCalledTimes(1);
    expect(deleteMultipleObject).toHaveBeenCalledWith(
      expect.objectContaining({ Objects: [{ Key: safeKey }] }),
      expect.any(Function)
    );
  });

  it('reports control-character keys whose single-object delete fails', async () => {
    const adapter = createAdapter();
    const deleteObject = vi
      .fn()
      .mockImplementation((_params, callback) => callback(new Error('delete denied')));
    const deleteMultipleObject = vi.fn();
    Object.assign((adapter as any).client, { deleteObject, deleteMultipleObject });

    const legacyKey = 'chat/app/legacy\r\nname.svg';
    await expect(adapter.deleteObjectsByRawKeys({ keys: [legacyKey] })).resolves.toEqual({
      bucket: 'fastgpt-private',
      keys: [legacyKey]
    });
    expect(deleteObject).toHaveBeenCalledTimes(1);
    expect(deleteMultipleObject).not.toHaveBeenCalled();
  });
});

describe('CosStorageAdapter.generatePublicGetUrl', () => {
  it.each([
    [undefined, 'https://fastgpt-private.cos.ap-guangzhou.myqcloud.com/folder%20%23/file%2B.txt'],
    ['cdn.example.com', 'https://cdn.example.com/folder%20%23/file%2B.txt']
  ])('encodes keys with domain %j', (domain, expectedUrl) => {
    const adapter = new CosStorageAdapter({
      vendor: 'cos',
      bucket: 'fastgpt-private',
      region: 'ap-guangzhou',
      protocol: 'https:',
      domain,
      credentials: {
        accessKeyId: 'secret-id',
        secretAccessKey: 'secret-key'
      }
    });

    expect(adapter.generatePublicGetUrl({ key: 'folder #/file+.txt' }).url).toBe(expectedUrl);
  });
});
