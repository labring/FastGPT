import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authOutLinkCrud: vi.fn(),
  assertWechatOutLink: vi.fn(),
  getQRCodeStatus: vi.fn(),
  storeGet: vi.fn(),
  storeDelete: vi.fn(),
  updateOne: vi.fn(),
  startWechatPolling: vi.fn()
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
    getQRCodeStatus = mocks.getQRCodeStatus;
  }
}));

vi.mock('@fastgpt/service/common/redis/stores', () => ({
  wechatQrLoginStore: {
    get: mocks.storeGet,
    delete: mocks.storeDelete
  }
}));

vi.mock('@fastgpt/service/support/outLink/schema', () => ({
  MongoOutLink: {
    updateOne: mocks.updateOne
  }
}));

vi.mock('@fastgpt/service/support/outLink/wechat/mq', () => ({
  startWechatPolling: mocks.startWechatPolling
}));

import handler from '@/pages/api/support/outLink/wechat/qrcode/status';

const outLinkId = '68ad85a7463006c963799a05';
const outLink = {
  _id: outLinkId,
  shareId: 'share-1',
  type: 'wechat'
};
const qrData = {
  qrcode: 'qr-id',
  qrcode_img_content: 'qr-content'
};
const createRes = () => ({ setHeader: vi.fn() }) as any;

describe('GET /api/support/outLink/wechat/qrcode/status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authOutLinkCrud.mockResolvedValue({ tmbId: 'tmb-1', outLink });
    mocks.assertWechatOutLink.mockResolvedValue(undefined);
    mocks.storeGet.mockResolvedValue(qrData);
    mocks.storeDelete.mockResolvedValue(true);
    mocks.updateOne.mockResolvedValue({ acknowledged: true });
    mocks.startWechatPolling.mockResolvedValue(undefined);
    mocks.getQRCodeStatus.mockResolvedValue({ status: 'wait' });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns expired only for a missing Redis value', async () => {
    mocks.storeGet.mockResolvedValue(undefined);
    const res = createRes();

    await expect(handler({ query: { outLinkId } } as any, res)).resolves.toEqual({
      status: 'expired'
    });

    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(mocks.storeGet).toHaveBeenCalledWith({ outLinkId, tmbId: 'tmb-1' });
    expect(mocks.getQRCodeStatus).not.toHaveBeenCalled();
    expect(mocks.updateOne).not.toHaveBeenCalled();
  });

  it('returns the upstream QR status without changing the outLink', async () => {
    mocks.getQRCodeStatus.mockResolvedValue({ status: 'scaned' });

    await expect(handler({ query: { outLinkId } } as any, createRes())).resolves.toEqual({
      status: 'scaned'
    });

    expect(mocks.getQRCodeStatus).toHaveBeenCalledWith('qr-id');
    expect(mocks.updateOne).not.toHaveBeenCalled();
    expect(mocks.storeDelete).not.toHaveBeenCalled();
    expect(mocks.startWechatPolling).not.toHaveBeenCalled();
  });

  it('persists confirmed credentials, deletes the QR state and starts polling', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-22T06:00:00.000Z'));
    mocks.getQRCodeStatus.mockResolvedValue({
      status: 'confirmed',
      bot_token: 'bot-token',
      ilink_bot_id: 'bot-id',
      baseurl: 'https://wechat.example.com',
      ilink_user_id: 'user-id'
    });

    await expect(handler({ query: { outLinkId } } as any, createRes())).resolves.toEqual({
      status: 'confirmed'
    });

    expect(mocks.updateOne).toHaveBeenCalledWith(
      { _id: outLinkId },
      {
        $set: {
          'app.token': 'bot-token',
          'app.baseUrl': 'https://wechat.example.com',
          'app.accountId': 'bot-id',
          'app.userId': 'user-id',
          'app.status': 'online',
          'app.loginTime': '2026-07-22T06:00:00.000Z',
          'app.syncBuf': '',
          'app.lastError': ''
        }
      }
    );
    expect(mocks.storeDelete).toHaveBeenCalledWith({ outLinkId, tmbId: 'tmb-1' });
    expect(mocks.startWechatPolling).toHaveBeenCalledWith('share-1');
  });

  it('keeps the existing fallback values for optional confirmed fields', async () => {
    mocks.getQRCodeStatus.mockResolvedValue({
      status: 'confirmed',
      bot_token: 'bot-token',
      ilink_bot_id: 'bot-id'
    });

    await handler({ query: { outLinkId } } as any, createRes());

    expect(mocks.updateOne).toHaveBeenCalledWith(
      { _id: outLinkId },
      expect.objectContaining({
        $set: expect.objectContaining({
          'app.baseUrl': 'https://ilinkai.weixin.qq.com',
          'app.userId': ''
        })
      })
    );
  });

  it.each([
    { status: 'confirmed', ilink_bot_id: 'bot-id' },
    { status: 'confirmed', bot_token: 'bot-token' }
  ])('does not confirm incomplete credentials: $status', async (statusData) => {
    mocks.getQRCodeStatus.mockResolvedValue(statusData);

    await expect(handler({ query: { outLinkId } } as any, createRes())).resolves.toEqual({
      status: 'confirmed'
    });

    expect(mocks.updateOne).not.toHaveBeenCalled();
    expect(mocks.storeDelete).not.toHaveBeenCalled();
    expect(mocks.startWechatPolling).not.toHaveBeenCalled();
  });

  it('propagates Store read errors instead of treating them as expired', async () => {
    const error = new Error('redis read failed');
    mocks.storeGet.mockRejectedValue(error);

    await expect(handler({ query: { outLinkId } } as any, createRes())).rejects.toBe(error);

    expect(mocks.getQRCodeStatus).not.toHaveBeenCalled();
    expect(mocks.updateOne).not.toHaveBeenCalled();
  });

  it('does not start polling when confirmed QR deletion fails', async () => {
    const error = new Error('redis delete failed');
    mocks.getQRCodeStatus.mockResolvedValue({
      status: 'confirmed',
      bot_token: 'bot-token',
      ilink_bot_id: 'bot-id'
    });
    mocks.storeDelete.mockRejectedValue(error);

    await expect(handler({ query: { outLinkId } } as any, createRes())).rejects.toBe(error);

    expect(mocks.updateOne).toHaveBeenCalled();
    expect(mocks.startWechatPolling).not.toHaveBeenCalled();
  });
});
