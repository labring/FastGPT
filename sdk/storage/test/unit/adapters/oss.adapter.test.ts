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
