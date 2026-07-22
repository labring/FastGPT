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
