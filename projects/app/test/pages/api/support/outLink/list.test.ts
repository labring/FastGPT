import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import { handler } from '@/pages/api/support/outLink/list';

vi.mock('@fastgpt/service/support/outLink/schema', () => ({
  MongoOutLink: { find: vi.fn() }
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

  it('normalizes legacy share links to anonymous access', async () => {
    mockList(baseOutLink);

    const result = await handler({
      query: { appId: id, type: PublishChannelEnum.share }
    } as any);

    expect(result[0].allowAnonymous).toBe(true);
  });

  it('removes allowAnonymous from non-share channel responses', async () => {
    mockList({ ...baseOutLink, type: PublishChannelEnum.feishu, allowAnonymous: false });

    const result = await handler({
      query: { appId: id, type: PublishChannelEnum.feishu }
    } as any);

    expect(result[0]).not.toHaveProperty('allowAnonymous');
  });
});
