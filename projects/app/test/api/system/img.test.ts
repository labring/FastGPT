import { beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '@/pages/api/system/img/[...id]';

const mocks = vi.hoisted(() => ({
  createPublicUrl: vi.fn(),
  resolveExistingObjectKey: vi.fn(),
  handleS3ProxyDownload: vi.fn(),
  handleS3ProxyRouteError: vi.fn(),
  storageDownloadUrlMode: 'short-proxy',
  isObjectIdValid: vi.fn(() => false)
}));

vi.mock('@fastgpt/service/common/s3/sources/avatar', () => ({
  getS3AvatarSource: vi.fn(() => ({
    bucketName: 'fastgpt-public',
    createPublicUrl: mocks.createPublicUrl,
    resolveExistingObjectKey: mocks.resolveExistingObjectKey
  }))
}));

vi.mock('@fastgpt/service/common/s3/config/constants', () => ({
  get storageDownloadUrlMode() {
    return mocks.storageDownloadUrlMode;
  }
}));

vi.mock('@/service/common/s3/proxy', () => ({
  handleS3ProxyDownload: mocks.handleS3ProxyDownload,
  handleS3ProxyRouteError: mocks.handleS3ProxyRouteError
}));

vi.mock('@fastgpt/service/common/file/image/controller', () => ({
  readMongoImg: vi.fn()
}));

vi.mock('@fastgpt/service/common/mongo', () => ({
  Types: {
    ObjectId: {
      isValid: mocks.isObjectIdValid
    }
  }
}));

describe('system image download', () => {
  const key = 'avatar/team-id/g0A71O-人事咨询小助手.png';
  const encodedPublicUrl =
    'https://cdn.example.com/avatar/team-id/g0A71O-%E4%BA%BA%E4%BA%8B%E5%92%A8%E8%AF%A2%E5%B0%8F%E5%8A%A9%E6%89%8B.png';

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.storageDownloadUrlMode = 'short-proxy';
    mocks.resolveExistingObjectKey.mockResolvedValue(key);
    mocks.createPublicUrl.mockReturnValue(encodedPublicUrl);
  });

  it('proxies the canonical object key without requiring an external endpoint', async () => {
    const req = {
      query: {
        id: key.split('/')
      }
    } as any;
    const res = {} as any;

    await handler(req, res);

    expect(mocks.handleS3ProxyDownload).toHaveBeenCalledWith({
      req,
      res,
      payload: {
        bucketName: 'fastgpt-public',
        objectKey:
          'avatar/team-id/g0A71O-%E4%BA%BA%E4%BA%8B%E5%92%A8%E8%AF%A2%E5%B0%8F%E5%8A%A9%E6%89%8B.png'
      }
    });
    expect(mocks.resolveExistingObjectKey).not.toHaveBeenCalled();
  });

  it('redirects with the resolved object key in short redirect mode', async () => {
    mocks.storageDownloadUrlMode = 'short-redirect';
    const req = {
      query: { id: key.split('/') }
    } as any;
    const res = {
      redirect: vi.fn()
    } as any;

    await handler(req, res);

    expect(mocks.resolveExistingObjectKey).toHaveBeenCalledWith(
      'avatar/team-id/g0A71O-%E4%BA%BA%E4%BA%8B%E5%92%A8%E8%AF%A2%E5%B0%8F%E5%8A%A9%E6%89%8B.png'
    );
    expect(mocks.createPublicUrl).toHaveBeenCalledWith(key);
    expect(res.redirect).toHaveBeenCalledWith(301, encodedPublicUrl);
    expect(mocks.handleS3ProxyDownload).not.toHaveBeenCalled();
  });

  it('returns 404 when the redirect object does not exist', async () => {
    mocks.storageDownloadUrlMode = 'short-redirect';
    mocks.resolveExistingObjectKey.mockResolvedValue(undefined);
    const req = {
      query: { id: key.split('/') }
    } as any;
    const res = {
      status: vi.fn(() => res),
      end: vi.fn(),
      redirect: vi.fn()
    } as any;

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.end).toHaveBeenCalledOnce();
    expect(res.redirect).not.toHaveBeenCalled();
  });
});
