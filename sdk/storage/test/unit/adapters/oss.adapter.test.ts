import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { OssStorageAdapter } from '../../../src/adapters/oss.adapter';

const createAdapter = () =>
  new OssStorageAdapter({
    vendor: 'oss',
    bucket: 'fastgpt-private',
    endpoint: 'http://localhost:9000',
    region: 'oss-cn-hangzhou',
    secure: false,
    credentials: {
      accessKeyId: 'access-key',
      secretAccessKey: 'secret-key'
    }
  });

describe('OssStorageAdapter.constructor', () => {
  it('rejects a non-OSS vendor', () => {
    expect(
      () =>
        new OssStorageAdapter({
          vendor: 'cos',
          bucket: 'fastgpt-private',
          endpoint: 'http://localhost:9000',
          region: 'oss-cn-hangzhou',
          credentials: {
            accessKeyId: 'access-key',
            secretAccessKey: 'secret-key'
          }
        } as never)
    ).toThrow('Invalid storage vendor: expected "oss"');
  });
});

describe('OssStorageAdapter.multipartUpload', () => {
  it('maps multipart uploads to ali-oss and preserves stream uploads', async () => {
    const adapter = createAdapter();
    const body = Buffer.from('part');
    const initMultipartUpload = vi.fn().mockResolvedValue({ uploadId: 'oss-upload-1' });
    const uploadPart = vi.fn().mockResolvedValue({ etag: 'oss-etag-1' });
    const completeMultipartUpload = vi.fn().mockResolvedValue({});
    const abortMultipartUpload = vi.fn().mockResolvedValue({});
    Object.assign((adapter as any).client, {
      initMultipartUpload,
      uploadPart,
      completeMultipartUpload,
      abortMultipartUpload
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
      uploadId: 'oss-upload-1'
    });
    await expect(
      adapter.uploadMultipartPart({
        key: 'dataset/file.txt',
        uploadId: 'oss-upload-1',
        partNumber: 1,
        body,
        contentLength: body.length
      })
    ).resolves.toMatchObject({ etag: 'oss-etag-1', partNumber: 1 });
    await adapter.completeMultipartUpload({
      key: 'dataset/file.txt',
      uploadId: 'oss-upload-1',
      parts: [{ partNumber: 1, etag: 'oss-etag-1' }]
    });
    await adapter.abortMultipartUpload({ key: 'dataset/file.txt', uploadId: 'oss-upload-1' });

    expect(initMultipartUpload).toHaveBeenCalledWith('dataset/file.txt', {
      headers: {
        'Content-Disposition': 'attachment; filename="file.txt"',
        'x-oss-meta-source-file': 'dataset'
      },
      mime: 'text/plain'
    });
    expect(uploadPart).toHaveBeenCalledWith(
      'dataset/file.txt',
      'oss-upload-1',
      1,
      body,
      0,
      body.length
    );
    expect(completeMultipartUpload).toHaveBeenCalledWith('dataset/file.txt', 'oss-upload-1', [
      { number: 1, etag: 'oss-etag-1' }
    ]);
    expect(abortMultipartUpload).toHaveBeenCalledWith('dataset/file.txt', 'oss-upload-1');
  });

  it('rejects invalid parts before calling ali-oss', async () => {
    const adapter = createAdapter();
    const uploadPart = vi.fn();
    (adapter as any).client.uploadPart = uploadPart;

    await expect(
      adapter.uploadMultipartPart({
        key: 'dataset/file.txt',
        uploadId: 'oss-upload-1',
        partNumber: 0,
        body: Buffer.from('part'),
        contentLength: 4
      })
    ).rejects.toThrow('Multipart partNumber must be an integer between 1 and 10000');
    expect(uploadPart).not.toHaveBeenCalled();
  });
});

describe('OssStorageAdapter.downloadObject', () => {
  it('rejects a pre-aborted download without requesting a stream', async () => {
    const adapter = createAdapter();
    const getStream = vi.fn();
    (adapter as any).client.getStream = getStream;
    const controller = new AbortController();
    controller.abort();

    await expect(
      adapter.downloadObject({ key: 'dataset/file.txt', abortSignal: controller.signal })
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(getStream).not.toHaveBeenCalled();
  });

  it('destroys an in-flight stream with the caller abort reason', async () => {
    const adapter = createAdapter();
    const stream = new PassThrough();
    (adapter as any).client.getStream = vi.fn().mockResolvedValue({ stream });
    const controller = new AbortController();
    const abortReason = new Error('client aborted');
    const result = await adapter.downloadObject({
      key: 'dataset/file.txt',
      abortSignal: controller.signal
    });
    result.body.on('error', () => {});

    controller.abort(abortReason);

    expect(result.body.errored).toBe(abortReason);
    expect(result.body.destroyed).toBe(true);
  });
});

describe('OssStorageAdapter.getObjectMetadata', () => {
  it('reads ETag from response headers returned by ali-oss', async () => {
    const adapter = createAdapter();
    (adapter as any).client.head = vi.fn().mockResolvedValue({
      meta: {},
      res: {
        headers: {
          etag: '"oss-etag"',
          'content-type': 'text/plain',
          'content-length': '4'
        }
      }
    });

    await expect(adapter.getObjectMetadata({ key: 'dataset/file.txt' })).resolves.toMatchObject({
      etag: 'oss-etag',
      contentType: 'text/plain',
      contentLength: 4
    });
  });
});

describe('OssStorageAdapter deletion boundaries', () => {
  it('treats an empty key list as a no-op', async () => {
    const adapter = createAdapter();
    const deleteMulti = vi.fn();
    (adapter as any).client.deleteMulti = deleteMulti;

    await expect(adapter.deleteObjectsByMultiKeys({ keys: [] })).resolves.toEqual({
      bucket: 'fastgpt-private',
      keys: []
    });
    expect(deleteMulti).not.toHaveBeenCalled();
  });

  it('returns only keys missing from the verbose delete response as failures', async () => {
    const adapter = createAdapter();
    const deleteMulti = vi.fn().mockResolvedValue({ deleted: ['first.txt'] });
    (adapter as any).client.deleteMulti = deleteMulti;

    await expect(
      adapter.deleteObjectsByMultiKeys({ keys: ['first.txt', 'second.txt'] })
    ).resolves.toEqual({
      bucket: 'fastgpt-private',
      keys: ['second.txt']
    });
    expect(deleteMulti).toHaveBeenCalledWith(['first.txt', 'second.txt'], { quiet: false });
  });

  it('splits multi-delete requests at the OSS 1000-key limit', async () => {
    const adapter = createAdapter();
    const keys = Array.from({ length: 1001 }, (_, index) => `dataset/file-${index}.txt`);
    const deleteMulti = vi.fn().mockImplementation(async (keyChunk: string[]) => ({
      deleted: keyChunk
    }));
    (adapter as any).client.deleteMulti = deleteMulti;

    await expect(adapter.deleteObjectsByMultiKeys({ keys })).resolves.toEqual({
      bucket: 'fastgpt-private',
      keys: []
    });
    expect(deleteMulti).toHaveBeenCalledTimes(2);
    expect(deleteMulti).toHaveBeenNthCalledWith(1, keys.slice(0, 1000), { quiet: false });
    expect(deleteMulti).toHaveBeenNthCalledWith(2, keys.slice(1000), { quiet: false });
  });

  it('normalizes the object-shaped Deleted entries produced by ali-oss XML parsing', async () => {
    const adapter = createAdapter();
    (adapter as any).client.deleteMulti = vi.fn().mockResolvedValue({
      deleted: [{ Key: 'first.txt' }, { Key: 'second.txt', VersionId: 'version-1' }]
    });

    await expect(
      adapter.deleteObjectsByMultiKeys({ keys: ['first.txt', 'second.txt'] })
    ).resolves.toEqual({
      bucket: 'fastgpt-private',
      keys: []
    });
  });

  it('conservatively returns every key when the verbose response omits deleted entries', async () => {
    const adapter = createAdapter();
    (adapter as any).client.deleteMulti = vi.fn().mockResolvedValue({});

    await expect(
      adapter.deleteObjectsByMultiKeys({ keys: ['first.txt', 'second.txt'] })
    ).resolves.toEqual({
      bucket: 'fastgpt-private',
      keys: ['first.txt', 'second.txt']
    });
  });

  it('preserves failures collected before a later listing page is empty', async () => {
    const adapter = createAdapter();
    (adapter as any).client.list = vi
      .fn()
      .mockResolvedValueOnce({
        objects: [{ name: 'dataset/failed.txt' }],
        isTruncated: true,
        nextMarker: 'dataset/next.txt'
      })
      .mockResolvedValueOnce({ objects: [], isTruncated: false });
    (adapter as any).client.deleteMulti = vi.fn().mockResolvedValue({ deleted: [] });

    await expect(adapter.deleteObjectsByPrefix({ prefix: 'dataset/' })).resolves.toEqual({
      bucket: 'fastgpt-private',
      keys: ['dataset/failed.txt']
    });
  });

  it('rejects a whitespace-only prefix without listing objects', async () => {
    const adapter = createAdapter();
    const list = vi.fn();
    (adapter as any).client.list = list;

    await expect(adapter.deleteObjectsByPrefix({ prefix: '   ' })).rejects.toThrow(
      'Prefix is required'
    );
    expect(list).not.toHaveBeenCalled();
  });
});

describe('OssStorageAdapter.generatePublicGetUrl', () => {
  it.each([
    [
      false,
      undefined,
      'https://fastgpt-private.oss-cn-hangzhou.aliyuncs.com/folder%20%23/file%2B.txt'
    ],
    [true, 'cdn.example.com', 'https://cdn.example.com/folder%20%23/file%2B.txt']
  ])('encodes keys with cname=%s', (cname, endpoint, expectedUrl) => {
    const adapter = new OssStorageAdapter({
      vendor: 'oss',
      bucket: 'fastgpt-private',
      endpoint,
      region: 'oss-cn-hangzhou',
      secure: true,
      cname,
      credentials: {
        accessKeyId: 'access-key',
        secretAccessKey: 'secret-key'
      }
    });

    expect(adapter.generatePublicGetUrl({ key: 'folder #/file+.txt' }).url).toBe(expectedUrl);
  });
});
