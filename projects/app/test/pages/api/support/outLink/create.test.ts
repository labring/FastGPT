import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handler } from '@/pages/api/support/outLink/create';
import { serviceEnv } from '@fastgpt/service/env';
import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';

vi.mock('@fastgpt/service/support/outLink/schema', () => ({ MongoOutLink: { create: vi.fn() } }));
vi.mock('@fastgpt/service/support/permission/app/auth', () => ({
  authApp: vi.fn(async () => ({
    teamId: 'team',
    tmbId: 'member',
    app: { name: 'app', type: 'workflow' }
  }))
}));
vi.mock('@fastgpt/service/support/user/audit/util', () => ({
  addAuditLog: vi.fn(),
  getI18nAppType: vi.fn()
}));
vi.mock('@/service/middleware/entry', () => ({ NextAPI: (handler: unknown) => handler }));
const initialEnabled = serviceEnv.SHOW_OUTLINK_BRAND;
beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  serviceEnv.SHOW_OUTLINK_BRAND = initialEnabled;
});

describe('create outlink branding', () => {
  it.each([undefined, false, true])(
    'resets client or copied brand value %s for new links',
    async (isShowBrand) => {
      serviceEnv.SHOW_OUTLINK_BRAND = true;
      await handler({
        body: {
          appId: '68ad85a7463006c963799a05',
          name: 'copied link',
          type: PublishChannelEnum.share,
          isShowBrand
        }
      } as any);
      expect(MongoOutLink.create).toHaveBeenCalledWith(
        expect.objectContaining({ isShowBrand: true })
      );
    }
  );
  it.each([PublishChannelEnum.share, PublishChannelEnum.feishu])(
    'does not write a brand field when disabled: %s',
    async (type) => {
      serviceEnv.SHOW_OUTLINK_BRAND = false;
      await handler({
        body: { appId: '68ad85a7463006c963799a05', name: 'link', type, isShowBrand: true }
      } as any);
      expect(vi.mocked(MongoOutLink.create).mock.calls[0][0]).not.toHaveProperty('isShowBrand');
    }
  );
  it('never adds branding to other channels even when enabled', async () => {
    serviceEnv.SHOW_OUTLINK_BRAND = true;
    await handler({
      body: {
        appId: '68ad85a7463006c963799a05',
        name: 'bot',
        type: PublishChannelEnum.feishu,
        isShowBrand: false
      }
    } as any);
    expect(vi.mocked(MongoOutLink.create).mock.calls[0][0]).not.toHaveProperty('isShowBrand');
  });
});
