import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authOutLinkCrud: vi.fn(),
  assertWechatOutLink: vi.fn(),
  getQRCode: vi.fn(),
  storeSet: vi.fn()
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

vi.mock('@fastgpt/service/common/redis/stores', () => ({
  WECHAT_QR_LOGIN_TTL_SECONDS: 480,
  wechatQrLoginStore: {
    set: mocks.storeSet
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
    mocks.storeSet.mockResolvedValue(undefined);
  });

  it('stores generated QR data and returns the Store TTL', async () => {
    const req = { body: { outLinkId } } as any;

    await expect(handler(req)).resolves.toEqual({ ...qrData, expireTime: 480 });

    expect(mocks.authOutLinkCrud).toHaveBeenCalledWith({
      req,
      authToken: true,
      outLinkId,
      per: expect.any(Number)
    });
    expect(mocks.assertWechatOutLink).toHaveBeenCalledWith(outLink);
    expect(mocks.storeSet).toHaveBeenCalledWith({
      outLinkId,
      tmbId: 'tmb-1',
      data: qrData
    });
  });

  it('propagates Store write failures instead of returning an unusable QR code', async () => {
    const error = new Error('redis write failed');
    mocks.storeSet.mockRejectedValue(error);

    await expect(handler({ body: { outLinkId } } as any)).rejects.toBe(error);
  });

  it('rejects invalid input before authorization or upstream calls', async () => {
    await expect(handler({ body: { outLinkId: 'invalid' } } as any)).rejects.toBeDefined();

    expect(mocks.authOutLinkCrud).not.toHaveBeenCalled();
    expect(mocks.getQRCode).not.toHaveBeenCalled();
    expect(mocks.storeSet).not.toHaveBeenCalled();
  });
});
