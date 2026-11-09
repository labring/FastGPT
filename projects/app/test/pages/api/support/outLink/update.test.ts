import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getTeamCanHideShareBrand } from '@fastgpt/service/support/wallet/sub/service';
import { OutLinkErrEnum } from '@fastgpt/global/common/error/code/outLink';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import { authOutLinkCrud } from '@fastgpt/service/support/permission/publish/authLink';
import { handler } from '@/pages/api/support/outLink/update';

vi.mock('@fastgpt/service/support/wallet/sub/service', () => ({
  getTeamCanHideShareBrand: vi.fn()
}));

vi.mock('@fastgpt/service/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/service/env')>();
  return { ...actual, serviceEnv: { ...actual.serviceEnv, SHOW_OUTLINK_BRAND: true } };
});

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

  it('preserves historical brand absence during ordinary edits', async () => {
    mockCrudResult(PublishChannelEnum.share);
    await request({ _id: id, name: 'edited name' });
    expect(vi.mocked(MongoOutLink.findByIdAndUpdate).mock.calls[0][1]).not.toHaveProperty(
      'isShowBrand'
    );
    expect(getTeamCanHideShareBrand).not.toHaveBeenCalled();
  });

  it('updates only the brand preference without resubmitting or overwriting the name', async () => {
    mockCrudResult(PublishChannelEnum.share);
    await request({ _id: id, isShowBrand: true });
    const update = vi.mocked(MongoOutLink.findByIdAndUpdate).mock.calls[0][1];
    expect(update).toHaveProperty('isShowBrand', true);
    expect(update).not.toHaveProperty('name');
  });

  it('still validates an explicitly supplied name', async () => {
    mockCrudResult(PublishChannelEnum.share);
    await expect(request({ _id: id, name: '', isShowBrand: true })).rejects.toBeDefined();
    expect(MongoOutLink.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('requires owning-team entitlement to hide and isolates other channels', async () => {
    vi.mocked(authOutLinkCrud).mockResolvedValue({
      tmbId: 'member',
      teamId: 'team',
      outLink: { type: PublishChannelEnum.share, teamId: 'team', name: 'link', isShowBrand: true },
      app: { name: 'app', type: 'workflow' }
    } as any);
    vi.mocked(getTeamCanHideShareBrand).mockResolvedValue(false);
    await expect(request({ _id: id, name: 'link', isShowBrand: false })).rejects.toBe(
      OutLinkErrEnum.cannotHideBrand
    );
    expect(MongoOutLink.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(getTeamCanHideShareBrand).toHaveBeenCalledWith('team');
    vi.mocked(getTeamCanHideShareBrand).mockResolvedValue(true);
    await request({ _id: id, name: 'link', isShowBrand: false });
    expect(MongoOutLink.findByIdAndUpdate).toHaveBeenCalledWith(
      id,
      expect.objectContaining({ isShowBrand: false })
    );
    vi.mocked(MongoOutLink.findByIdAndUpdate).mockClear();
    mockCrudResult(PublishChannelEnum.feishu);
    await request({ _id: id, name: 'link', isShowBrand: true });
    expect(vi.mocked(MongoOutLink.findByIdAndUpdate).mock.calls[0][1]).not.toHaveProperty(
      'isShowBrand'
    );
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
