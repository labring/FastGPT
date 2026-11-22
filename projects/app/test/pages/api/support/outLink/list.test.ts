import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getTeamCanHideShareBrand } from '@fastgpt/service/support/wallet/sub/service';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import { handler } from '@/pages/api/support/outLink/list';

vi.mock('@fastgpt/service/support/wallet/sub/service', () => ({
  getTeamCanHideShareBrand: vi.fn()
}));

vi.mock('@fastgpt/service/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/service/env')>();
  return { ...actual, serviceEnv: { ...actual.serviceEnv, SHOW_OUTLINK_BRAND: true } };
});

vi.mock('@fastgpt/service/support/outLink/schema', () => ({
  MongoOutLink: { find: vi.fn(), updateOne: vi.fn() }
}));

vi.mock('@fastgpt/service/support/permission/app/auth', () => ({
  authApp: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: (handler: unknown) => handler
}));

const id = '68ad85a7463006c963799a05';
const baseOutLink = {
  _id: id,
  shareId: 'share-id',
  teamId: id,
  tmbId: id,
  appId: id,
  name: 'link',
  type: PublishChannelEnum.share
};

const mockList = (outLink: Record<string, unknown>) => {
  vi.mocked(MongoOutLink.find).mockReturnValue({
    sort: vi.fn().mockResolvedValue([{ toObject: () => outLink }])
  } as any);
};

describe('list outlink anonymous access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the saved hiding preference without checking or rewriting entitlement', async () => {
    vi.mocked(getTeamCanHideShareBrand).mockResolvedValue(false);
    mockList({ ...baseOutLink, isShowBrand: false });
    const result = await handler({ query: { appId: id, type: PublishChannelEnum.share } } as any);
    expect(result[0].isShowBrand).toBe(false);
    expect(getTeamCanHideShareBrand).not.toHaveBeenCalled();
    expect(MongoOutLink.updateOne).not.toHaveBeenCalled();
  });

  it('normalizes legacy share links to anonymous access', async () => {
    mockList(baseOutLink);

    const result = await handler({
      query: { appId: id, type: PublishChannelEnum.share }
    } as any);

    expect(result[0].allowAnonymous).toBe(true);
    expect(result[0]).not.toHaveProperty('isShowBrand');
  });

  it('only exposes WeChat binding status to the editor', async () => {
    mockList({
      ...baseOutLink,
      type: PublishChannelEnum.wechat,
      app: {
        status: 'online',
        token: 'stored-token',
        baseUrl: 'https://ilinkai.weixin.qq.com',
        syncBuf: 'stored-cursor'
      }
    });

    const result = await handler({ query: { appId: id, type: PublishChannelEnum.wechat } } as any);
    expect(result[0].app).toEqual({ isBound: true, status: 'online' });
  });

  it.each([
    ['private_address', 'private_address'],
    ['raw upstream failure', undefined],
    [{ detail: 'legacy failure' }, undefined]
  ])('only exposes a known WeChat error reason (%s)', async (lastError, errorReason) => {
    mockList({
      ...baseOutLink,
      type: PublishChannelEnum.wechat,
      app: { status: 'error', token: 'stored-token', lastError }
    });

    const [item] = await handler({ query: { appId: id, type: PublishChannelEnum.wechat } } as any);
    expect(item.app).toMatchObject({ status: 'error', isBound: true });
    expect(item.app.errorReason).toBe(errorReason);
    expect(item.app).not.toHaveProperty('lastError');
  });

  it('preserves the error status and reason when a stored token is malformed', async () => {
    mockList({
      ...baseOutLink,
      type: PublishChannelEnum.wechat,
      app: { status: 'error', token: null, lastError: 'private_address' }
    });

    const [item] = await handler({ query: { appId: id, type: PublishChannelEnum.wechat } } as any);
    expect(item.app).toEqual({
      status: 'error',
      isBound: false,
      errorReason: 'private_address'
    });
  });

  it('removes allowAnonymous from non-share channel responses', async () => {
    mockList({
      ...baseOutLink,
      type: PublishChannelEnum.feishu,
      allowAnonymous: false,
      isShowBrand: true
    });

    const result = await handler({
      query: { appId: id, type: PublishChannelEnum.feishu }
    } as any);

    expect(result[0]).not.toHaveProperty('allowAnonymous');
    expect(result[0]).not.toHaveProperty('isShowBrand');
  });
});
