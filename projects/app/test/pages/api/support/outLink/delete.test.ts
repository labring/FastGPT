import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import { authOutLinkCrud } from '@fastgpt/service/support/permission/publish/authLink';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { stopWechatPolling } from '@fastgpt/service/support/outLink/wechat/mq';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import handler from '@/pages/api/support/outLink/delete';

vi.mock('@fastgpt/service/support/outLink/schema', () => ({
  MongoOutLink: { findById: vi.fn() }
}));

vi.mock('@fastgpt/service/support/permission/publish/authLink', () => ({
  authOutLinkCrud: vi.fn()
}));

vi.mock('@fastgpt/service/support/outLink/wechat/mq', () => ({
  stopWechatPolling: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('@fastgpt/service/support/user/audit/util', () => ({
  addAuditLog: vi.fn(),
  getI18nAppType: vi.fn(() => 'workflow')
}));

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: (handler: unknown) => handler
}));

const id = '68ad85a7463006c963799a05';
const request = (query: Record<string, unknown>) => (handler as any)({ query });

describe('delete outlink', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authOutLinkCrud).mockResolvedValue({
      tmbId: 'tmb-id',
      teamId: 'team-id',
      outLink: { _id: id, type: 'share', name: 'link' },
      app: { name: 'app', type: 'workflow' }
    } as any);
  });

  it('authenticates with ManagePermissionVal and deletes outlink', async () => {
    const deleteOneMock = vi.fn().mockResolvedValue({});
    vi.mocked(MongoOutLink.findById).mockResolvedValue({
      _id: id,
      type: 'share',
      deleteOne: deleteOneMock
    } as any);

    await request({ id });

    expect(authOutLinkCrud).toHaveBeenCalledWith(
      expect.objectContaining({
        outLinkId: id,
        authToken: true,
        per: ManagePermissionVal
      })
    );
    expect(deleteOneMock).toHaveBeenCalled();
  });

  it('stops wechat polling when outlink type is wechat', async () => {
    const deleteOneMock = vi.fn().mockResolvedValue({});
    vi.mocked(MongoOutLink.findById).mockResolvedValue({
      _id: id,
      type: 'wechat',
      shareId: 'wechat-share-id',
      deleteOne: deleteOneMock
    } as any);

    await request({ id });

    expect(stopWechatPolling).toHaveBeenCalledWith('wechat-share-id');
    expect(deleteOneMock).toHaveBeenCalled();
  });
});
