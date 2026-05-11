import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CosStorageAdapter } from '../../../../sdk/storage/src/adapters/cos.adapter';

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
