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
