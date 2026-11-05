import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handler } from '@/pages/api/core/chat/outLink/init';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { ChatGenerateStatusEnum, ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { ChatGenerationLeaseCache } from '@fastgpt/dal/redis/lease/chat/chatGenerationLease';

const mocks = vi.hoisted(() => ({
  brandingEnabled: true,
  auth: vi.fn(),
  entitlement: vi.fn(),
  correction: vi.fn(),
  chat: vi.fn(),
  updateChat: vi.fn(),
  app: vi.fn()
}));
vi.mock('@fastgpt/service/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/service/env')>();
  return {
    ...actual,
    serviceEnv: {
      ...actual.serviceEnv,
      get SHOW_OUTLINK_BRAND() {
        return mocks.brandingEnabled;
      }
    }
  };
});
vi.mock('@fastgpt/service/support/permission/publish/authChat', () => ({
  authOutLink: mocks.auth
}));
vi.mock('@fastgpt/service/support/wallet/sub/service', () => ({
  getTeamCanHideShareBrand: mocks.entitlement
}));
vi.mock('@fastgpt/service/support/outLink/schema', () => ({
  MongoOutLink: { updateOne: mocks.correction }
}));
vi.mock('@fastgpt/service/core/chat/chatSchema', () => ({
  MongoChat: { findOne: () => ({ lean: mocks.chat }), updateOne: mocks.updateChat }
}));
vi.mock('@fastgpt/service/core/app/schema', () => ({
  MongoApp: { findById: () => ({ lean: mocks.app }) }
}));
vi.mock('@fastgpt/service/core/app/version/controller', () => ({
  getAppLatestVersion: vi.fn(async () => ({ nodes: [], chatConfig: {} }))
}));
vi.mock('@fastgpt/service/core/chat/utils', () => ({
  presignVariablesFileUrls: vi.fn(async () => ({}))
}));
vi.mock('@/service/middleware/entry', () => ({ NextAPI: (handler: unknown) => handler }));
const id = '68ad85a7463006c963799a05';
const leaseCache = new ChatGenerationLeaseCache();
const leaseParams = { sourceType: ChatSourceTypeEnum.app, sourceId: id, chatId: 'branding-chat' };
const leaseToken = 'branding-test-lease';
const request = (chatId?: string) =>
  handler({
    query: { chatId, outLinkAuthData: JSON.stringify({ shareId: 'share', outLinkUid: 'visitor' }) }
  } as any);
const auth = (brand?: boolean) =>
  mocks.auth.mockResolvedValue({
    uid: 'visitor',
    appId: id,
    outLinkConfig: {
      _id: id,
      teamId: id,
      appId: id,
      type: PublishChannelEnum.share,
      ...(brand !== undefined ? { isShowBrand: brand } : {})
    }
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.brandingEnabled = true;
  mocks.entitlement.mockResolvedValue(false);
  mocks.correction.mockResolvedValue({});
  mocks.chat.mockResolvedValue(null);
  mocks.updateChat.mockResolvedValue({});
  mocks.app.mockResolvedValue({ _id: id, name: 'App', type: AppTypeEnum.workflow });
});
afterEach(async () => {
  await leaseCache.release({ params: leaseParams, token: leaseToken });
});

describe('outlink initialization branding', () => {
  it('keeps historical exemptions and emits only the rendering contract', async () => {
    auth();
    const result = await request();
    expect(result.branding).toEqual({ enabled: true, showBrand: false });
    expect(result).not.toHaveProperty('teamId');
    expect(result).not.toHaveProperty('canHideShareBrand');
    expect(mocks.entitlement).not.toHaveBeenCalled();
  });
  it('shows branding after entitlement loss and restores saved hiding after recovery without writes', async () => {
    auth(false);
    expect((await request()).branding).toEqual({ enabled: true, showBrand: true });
    expect(mocks.entitlement).toHaveBeenCalledWith(id);
    expect(mocks.correction).not.toHaveBeenCalled();

    mocks.entitlement.mockResolvedValue(true);
    expect((await request()).branding).toEqual({ enabled: true, showBrand: false });
    expect(mocks.correction).not.toHaveBeenCalled();
  });
  it('preserves qualified hiding and globally disabled preferences', async () => {
    auth(false);
    mocks.entitlement.mockResolvedValue(true);
    expect((await request()).branding.showBrand).toBe(false);
    mocks.brandingEnabled = false;
    auth(true);
    expect((await request()).branding).toEqual({ enabled: false, showBrand: false });
    expect(mocks.correction).not.toHaveBeenCalled();
  });
  it('does not resolve branding before share authentication succeeds', async () => {
    mocks.auth.mockRejectedValueOnce(new Error('not authorized'));
    await expect(request()).rejects.toThrow('not authorized');
    expect(mocks.entitlement).not.toHaveBeenCalled();
    expect(mocks.correction).not.toHaveBeenCalled();
  });
  it('returns branding and the active Redis lease without marking the chat read', async () => {
    auth(true);
    mocks.chat.mockResolvedValue({ outLinkUid: 'visitor', hasBeenRead: false });
    const lease = await leaseCache.tryAcquire({
      params: leaseParams,
      token: leaseToken,
      ttlMs: 60000
    });
    expect(lease.acquired).toBe(true);

    expect(await request(leaseParams.chatId)).toMatchObject({
      branding: { enabled: true, showBrand: true },
      chatGenerateStatus: ChatGenerateStatusEnum.generating,
      hasBeenRead: false
    });
    expect(mocks.updateChat).not.toHaveBeenCalled();
  });
  it('uses the idle lease status alongside branding despite a stale Mongo generation status', async () => {
    auth(true);
    mocks.chat.mockResolvedValue({
      outLinkUid: 'visitor',
      hasBeenRead: false,
      chatGenerateStatus: ChatGenerateStatusEnum.generating
    });

    expect(await request(leaseParams.chatId)).toMatchObject({
      branding: { enabled: true, showBrand: true },
      chatGenerateStatus: ChatGenerateStatusEnum.done,
      hasBeenRead: true
    });
    expect(mocks.updateChat).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ appId: id, chatId: leaseParams.chatId }),
      { $set: { hasBeenRead: true } }
    );
  });
});
