import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import { authOutLinkCrud } from '@fastgpt/service/support/permission/publish/authLink';
import { handler } from '@/pages/api/support/outLink/update';

vi.mock('@fastgpt/service/support/outLink/schema', () => ({
  MongoOutLink: { findByIdAndUpdate: vi.fn() }
}));

vi.mock('@fastgpt/service/support/permission/publish/authLink', () => ({
  authOutLinkCrud: vi.fn()
}));

vi.mock('@fastgpt/service/support/user/audit/util', () => ({
  addAuditLog: vi.fn(),
  getI18nAppType: vi.fn(() => 'workflow')
}));

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: (handler: unknown) => handler
}));

const id = '68ad85a7463006c963799a05';
const request = (body: Record<string, unknown>) => handler({ body } as any);

const mockCrudResult = (type: PublishChannelEnum) => {
  vi.mocked(authOutLinkCrud).mockResolvedValue({
    tmbId: 'tmb-id',
    teamId: 'team-id',
    outLink: { type, name: 'link' },
    app: { name: 'app', type: 'workflow' }
  } as any);
};

describe('update outlink anonymous access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(MongoOutLink.findByIdAndUpdate).mockResolvedValue({ shareId: 'share-id' } as any);
  });

  it('preserves a share link anonymous-access setting when omitted', async () => {
    mockCrudResult(PublishChannelEnum.share);

    await request({ _id: id, name: 'link' });

    const update = vi.mocked(MongoOutLink.findByIdAndUpdate).mock.calls[0][1];
    expect(update).not.toHaveProperty('allowAnonymous');
  });

  it('persists an explicitly supplied share value', async () => {
    mockCrudResult(PublishChannelEnum.share);

    await request({ _id: id, name: 'link', allowAnonymous: false });

    expect(MongoOutLink.findByIdAndUpdate).toHaveBeenCalledWith(
      id,
      expect.objectContaining({ allowAnonymous: false })
    );
  });

  it('does not persist allowAnonymous for non-share channels', async () => {
    mockCrudResult(PublishChannelEnum.feishu);

    await request({ _id: id, name: 'link', allowAnonymous: false });

    const update = vi.mocked(MongoOutLink.findByIdAndUpdate).mock.calls[0][1];
    expect(update).not.toHaveProperty('allowAnonymous');
  });
});
