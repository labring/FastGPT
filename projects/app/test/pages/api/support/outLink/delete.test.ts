import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import { authOutLinkCrud } from '@fastgpt/service/support/permission/publish/authLink';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { removeWechatPollJob } from '@fastgpt/service/support/outLink/wechat/mq';
import handler from '@/pages/api/support/outLink/delete';

vi.mock('@fastgpt/service/support/outLink/schema', () => ({
  MongoOutLink: { deleteOne: vi.fn() }
}));

vi.mock('@fastgpt/service/support/permission/publish/authLink', () => ({
  authOutLinkCrud: vi.fn()
}));

vi.mock('@fastgpt/service/support/outLink/wechat/mq', () => ({
  removeWechatPollJob: vi.fn().mockResolvedValue(undefined)
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
    await request({ id });

    expect(authOutLinkCrud).toHaveBeenCalledWith(
      expect.objectContaining({
        outLinkId: id,
        authToken: true,
        per: ManagePermissionVal
      })
    );
    expect(MongoOutLink.deleteOne).toHaveBeenCalledWith({ _id: id, teamId: 'team-id' });
  });

  it('removes the pending WeChat job after deleting the authorized channel', async () => {
    vi.mocked(authOutLinkCrud).mockResolvedValue({
      tmbId: 'tmb-id',
      teamId: 'team-id',
      outLink: { _id: id, type: 'wechat', shareId: 'wechat-share-id', name: 'link' },
      app: { name: 'app', type: 'workflow' }
    } as any);

    await request({ id });

    expect(MongoOutLink.deleteOne).toHaveBeenCalledBefore(vi.mocked(removeWechatPollJob));
    expect(removeWechatPollJob).toHaveBeenCalledWith('wechat-share-id');
  });
});
