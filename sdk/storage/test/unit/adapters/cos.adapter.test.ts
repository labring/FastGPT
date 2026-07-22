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
  it('destroys the output stream when the caller aborts the download', async () => {
    const adapter = createAdapter();
    (adapter as any).client.getObject = vi.fn();
    const controller = new AbortController();

    const { body } = await adapter.downloadObject({
      key: 'dataset/team/file.txt',
      abortSignal: controller.signal
    });
    controller.abort(new Error('client aborted'));

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
