import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authOutLinkCrud: vi.fn(),
  assertWechatOutLink: vi.fn(),
  getQRCode: vi.fn(),
  repositorySet: vi.fn(),
  updateOne: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: (handler: unknown) => handler
}));

vi.mock('@fastgpt/service/support/permission/publish/authLink', () => ({
  authOutLinkCrud: mocks.authOutLinkCrud
}));

vi.mock('@fastgpt/service/support/outLink/wechat/utils', () => ({
  assertWechatOutLink: mocks.assertWechatOutLink
}));

vi.mock('@fastgpt/service/support/outLink/wechat/ilinkClient', () => ({
  ILinkClient: class {
    getQRCode = mocks.getQRCode;
  }
}));

vi.mock('@fastgpt/service/support/outLink/schema', () => ({
  MongoOutLink: { updateOne: mocks.updateOne }
}));
vi.mock('@fastgpt/service/support/outLink/wechat/mq', () => ({ startWechatPolling: vi.fn() }));

vi.mock('@fastgpt/dal/redis/caches', () => ({
  WECHAT_QR_LOGIN_TTL_SECONDS: 480,
  wechatQrLoginCache: {
    set: mocks.repositorySet
  }
}));

import handler from '@/pages/api/support/outLink/wechat/qrcode/generate';

const outLinkId = '68ad85a7463006c963799a05';
const outLink = { _id: outLinkId, type: 'wechat' };
const qrData = {
  qrcode: 'qr-id',
  qrcode_img_content: 'qr-content'
};

describe('POST /api/support/outLink/wechat/qrcode/generate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authOutLinkCrud.mockResolvedValue({ tmbId: 'tmb-1', outLink });
    mocks.assertWechatOutLink.mockResolvedValue(undefined);
    mocks.getQRCode.mockResolvedValue(qrData);
    mocks.repositorySet.mockResolvedValue(undefined);
    mocks.updateOne.mockResolvedValue({ matchedCount: 1 });
  });

  it('returns the QR image and TTL while caching the QR identifier', async () => {
    const req = { body: { outLinkId } } as any;

    const result = (await handler(req)) as { attemptId: string };
    expect(result).toEqual({ ...qrData, expireTime: 480, attemptId: expect.any(String) });
    expect(mocks.updateOne).toHaveBeenCalledWith(
      { _id: outLinkId, type: 'wechat' },
      { $set: { 'app.qrAttemptId': result.attemptId } }
    );

    expect(mocks.authOutLinkCrud).toHaveBeenCalledWith({
      req,
      authToken: true,
      outLinkId,
      per: expect.any(Number)
    });
    expect(mocks.assertWechatOutLink).toHaveBeenCalledWith(outLink);
    expect(mocks.repositorySet).toHaveBeenCalledWith({
      outLinkId,
      tmbId: 'tmb-1',
      attemptId: result.attemptId,
      data: { qrcode: qrData.qrcode }
    });
  });

  it('does not cache a QR code when iLink omits the image content', async () => {
    mocks.getQRCode.mockResolvedValue({ qrcode: qrData.qrcode });

    await expect(handler({ body: { outLinkId } } as any)).rejects.toThrow(
      'invalid QR image content'
    );
    expect(mocks.repositorySet).not.toHaveBeenCalled();
  });

  it('propagates Cache write failures instead of returning an unusable QR code', async () => {
    const error = new Error('redis write failed');
    mocks.repositorySet.mockRejectedValue(error);

    await expect(handler({ body: { outLinkId } } as any)).rejects.toBe(error);
  });

  it('rejects invalid input before authorization or upstream calls', async () => {
    await expect(handler({ body: { outLinkId: 'invalid' } } as any)).rejects.toBeDefined();

    expect(mocks.authOutLinkCrud).not.toHaveBeenCalled();
    expect(mocks.getQRCode).not.toHaveBeenCalled();
    expect(mocks.repositorySet).not.toHaveBeenCalled();
  });
});
