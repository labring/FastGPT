import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UserError } from '@fastgpt/global/common/error/utils';
import { WechatRequestPolicyError } from '@fastgpt/service/support/outLink/wechat/request';

const mocks = vi.hoisted(() => ({
  authOutLinkCrud: vi.fn(),
  assertWechatOutLink: vi.fn(),
  getQRCodeStatus: vi.fn(),
  repositoryGet: vi.fn(),
  exists: vi.fn(),
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

vi.mock('@fastgpt/dal/redis/caches', () => ({
  wechatQrLoginCache: {
    get: mocks.repositoryGet
  }
}));

vi.mock('@fastgpt/service/support/outLink/schema', () => ({
  MongoOutLink: {
    updateOne: mocks.updateOne,
    exists: mocks.exists
  }
}));

vi.mock('@fastgpt/service/support/outLink/wechat/mq', () => ({
  startWechatPolling: mocks.startWechatPolling
}));

import handler from '@/pages/api/support/outLink/wechat/qrcode/status';

const outLinkId = '68ad85a7463006c963799a05';
const attemptId = 'eab36734-81b6-4346-a623-fd3821712cd6';
const outLink = {
  _id: outLinkId,
  shareId: 'share-1',
  type: 'wechat',
  app: { qrAttemptId: attemptId }
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
    mocks.repositoryGet.mockResolvedValue(qrData);
    mocks.updateOne.mockResolvedValue({ modifiedCount: 1 });
    mocks.exists.mockResolvedValue(null);
    mocks.startWechatPolling.mockResolvedValue(undefined);
    mocks.getQRCodeStatus.mockResolvedValue({ status: 'wait' });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns expired only for a missing Redis value', async () => {
    mocks.repositoryGet.mockResolvedValue(undefined);
    const res = createRes();

    await expect(handler({ query: { outLinkId } } as any, res)).resolves.toEqual({
      status: 'expired'
    });

    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(mocks.repositoryGet).toHaveBeenCalledWith({ outLinkId, tmbId: 'tmb-1', attemptId });
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
    expect(mocks.startWechatPolling).not.toHaveBeenCalled();
  });

  it('persists confirmed credentials once for its attempt and starts polling', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-22T06:00:00.000Z'));
    mocks.getQRCodeStatus.mockResolvedValue({
      status: 'confirmed',
      bot_token: 'bot-token',
      ilink_bot_id: 'bot-id',
      baseurl: 'https://ilinkai.weixin.qq.com',
      ilink_user_id: 'user-id'
    });

    await expect(handler({ query: { outLinkId } } as any, createRes())).resolves.toEqual({
      status: 'confirmed'
    });

    expect(mocks.updateOne).toHaveBeenCalledWith(
      {
        _id: outLinkId,
        type: 'wechat',
        'app.qrAttemptId': attemptId,
        'app.bindingId': { $ne: attemptId }
      },
      {
        $set: {
          'app.token': 'bot-token',
          'app.baseUrl': 'https://ilinkai.weixin.qq.com',
          'app.accountId': 'bot-id',
          'app.userId': 'user-id',
          'app.status': 'online',
          'app.bindingId': attemptId,
          'app.loginTime': '2026-07-22T06:00:00.000Z',
          'app.syncBuf': '',
          'app.lastError': ''
        }
      }
    );
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
      expect.objectContaining({ _id: outLinkId, 'app.qrAttemptId': attemptId }),
      expect.objectContaining({
        $set: expect.objectContaining({
          'app.baseUrl': 'https://ilinkai.weixin.qq.com',
          'app.userId': ''
        })
      })
    );
  });

  it('does not bind credentials to an unapproved service address', async () => {
    mocks.getQRCodeStatus.mockResolvedValue({
      status: 'confirmed',
      bot_token: 'bot-token',
      ilink_bot_id: 'bot-id',
      baseurl: 'https://example.invalid'
    });

    await expect(handler({ query: { outLinkId } } as any, createRes())).rejects.toThrow(
      'outside the allowed endpoints'
    );
    expect(mocks.updateOne).not.toHaveBeenCalled();
    expect(mocks.startWechatPolling).not.toHaveBeenCalled();
  });

  it.each([
    { status: 'confirmed', ilink_bot_id: 'bot-id' },
    { status: 'confirmed', bot_token: 'bot-token' }
  ])('does not confirm incomplete credentials: $status', async (statusData) => {
    mocks.getQRCodeStatus.mockResolvedValue(statusData);
    await expect(handler({ query: { outLinkId } } as any, createRes())).rejects.toThrow(
      'without binding credentials'
    );

    expect(mocks.updateOne).not.toHaveBeenCalled();
    expect(mocks.startWechatPolling).not.toHaveBeenCalled();
  });

  it('propagates Cache read errors instead of treating them as expired', async () => {
    const error = new Error('redis read failed');
    mocks.repositoryGet.mockRejectedValue(error);

    await expect(handler({ query: { outLinkId } } as any, createRes())).rejects.toBe(error);

    expect(mocks.getQRCodeStatus).not.toHaveBeenCalled();
    expect(mocks.updateOne).not.toHaveBeenCalled();
  });

  it('does not apply a late confirmation after the attempt has been replaced', async () => {
    mocks.getQRCodeStatus.mockResolvedValue({
      status: 'confirmed',
      bot_token: 'bot-token',
      ilink_bot_id: 'bot-id'
    });
    mocks.updateOne.mockResolvedValue({ modifiedCount: 0 });

    await expect(handler({ query: { outLinkId, attemptId } } as any, createRes())).resolves.toEqual(
      {
        status: 'expired'
      }
    );
    expect(mocks.exists).toHaveBeenCalledWith(
      expect.objectContaining({ 'app.bindingId': attemptId })
    );
    expect(mocks.startWechatPolling).not.toHaveBeenCalled();
  });

  it('recognizes a parallel confirmation of the same attempt without writing again', async () => {
    mocks.getQRCodeStatus.mockResolvedValue({
      status: 'confirmed',
      bot_token: 'bot-token',
      ilink_bot_id: 'bot-id'
    });
    mocks.updateOne.mockResolvedValue({ modifiedCount: 0 });
    mocks.exists.mockResolvedValue({ _id: outLinkId });

    await expect(handler({ query: { outLinkId, attemptId } } as any, createRes())).resolves.toEqual(
      {
        status: 'confirmed'
      }
    );
    expect(mocks.updateOne).toHaveBeenCalledTimes(1);
    expect(mocks.startWechatPolling).toHaveBeenCalledWith('share-1');
  });

  it('recovers queue scheduling after the binding was already saved', async () => {
    mocks.authOutLinkCrud.mockResolvedValue({
      tmbId: 'tmb-1',
      outLink: { ...outLink, app: { ...outLink.app, bindingId: attemptId } }
    });
    mocks.startWechatPolling.mockRejectedValueOnce(new Error('queue unavailable'));
    const req = { query: { outLinkId, attemptId } } as any;
    await expect(handler(req, createRes())).rejects.toThrow('queue unavailable');
    await expect(handler(req, createRes())).resolves.toEqual({ status: 'confirmed' });
    expect(mocks.getQRCodeStatus).not.toHaveBeenCalled();
    expect(mocks.updateOne).not.toHaveBeenCalled();
  });

  it('rejects a request for an old attempt without reading Redis or iLink', async () => {
    const oldAttemptId = '7526d2d7-a6c2-4327-89ed-bb77f3318515';
    await expect(
      handler({ query: { outLinkId, attemptId: oldAttemptId } } as any, createRes())
    ).resolves.toEqual({ status: 'expired' });
    expect(mocks.repositoryGet).not.toHaveBeenCalled();
    expect(mocks.getQRCodeStatus).not.toHaveBeenCalled();
  });

  it('maps raw upstream status failures to a localized UserError while keeping policy errors', async () => {
    const policyError = new WechatRequestPolicyError('private_address');
    mocks.getQRCodeStatus.mockRejectedValueOnce(policyError);
    await expect(handler({ query: { outLinkId, attemptId } } as any, createRes())).rejects.toBe(
      policyError
    );

    mocks.getQRCodeStatus.mockRejectedValueOnce(
      new Error('iLink GET ilink/bot/get_qrcode_status failed: TypeError: fetch failed')
    );
    const caughtUpstream = await handler(
      { query: { outLinkId, attemptId } } as any,
      createRes()
    ).catch((err) => err);
    expect(caughtUpstream).toBeInstanceOf(UserError);
    expect(caughtUpstream).toMatchObject({
      displayMessage: 'publish:wechat.status_check_failed'
    });
    expect(mocks.updateOne).not.toHaveBeenCalled();
  });
});
