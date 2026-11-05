import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handler } from '@/pages/api/support/outLink/branding';
import { OutLinkErrEnum } from '@fastgpt/global/common/error/code/outLink';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), entitlement: vi.fn() }));
vi.mock('@fastgpt/service/support/permission/publish/authLink', () => ({
  authOutLinkCrud: mocks.auth
}));
vi.mock('@fastgpt/service/support/wallet/sub/service', () => ({
  getTeamCanHideShareBrand: mocks.entitlement
}));
vi.mock('@/service/middleware/entry', () => ({ NextAPI: (handler: unknown) => handler }));

const id = '68ad85a7463006c963799a05';
const teamId = '68ad85a7463006c963799a06';
const request = (query: Record<string, unknown> = { id }) => handler({ query } as any);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({
    outLink: { teamId, type: PublishChannelEnum.share, isShowBrand: false }
  });
  mocks.entitlement.mockResolvedValue(true);
});

describe('handler', () => {
  it.each([undefined, true, false])(
    'returns the saved preference %s without defaulting it',
    async (isShowBrand) => {
      mocks.auth.mockResolvedValueOnce({
        outLink: { teamId, type: PublishChannelEnum.share, isShowBrand }
      });
      expect(await request()).toEqual({ isShowBrand, canHideShareBrand: true });
      expect(mocks.auth).toHaveBeenCalledWith({
        req: { query: { id } },
        outLinkId: id,
        authToken: true,
        per: ManagePermissionVal
      });
      expect(mocks.entitlement).toHaveBeenCalledWith(teamId);
    }
  );

  it('returns a definite missing entitlement as false', async () => {
    mocks.entitlement.mockResolvedValueOnce(false);
    expect(await request()).toEqual({ isShowBrand: false, canHideShareBrand: false });
  });

  it.each([{}, { id: '' }, { id: 'invalid' }])(
    'rejects invalid input before authentication: %j',
    async (query) => {
      await expect(request(query)).rejects.toBeDefined();
      expect(mocks.auth).not.toHaveBeenCalled();
      expect(mocks.entitlement).not.toHaveBeenCalled();
    }
  );

  it('does not query entitlement when link management is denied', async () => {
    mocks.auth.mockRejectedValueOnce(OutLinkErrEnum.unAuthLink);
    await expect(request()).rejects.toBe(OutLinkErrEnum.unAuthLink);
    expect(mocks.entitlement).not.toHaveBeenCalled();
  });

  it('rejects unrelated publishing channels', async () => {
    mocks.auth.mockResolvedValueOnce({ outLink: { teamId, type: PublishChannelEnum.feishu } });
    await expect(request()).rejects.toBe(OutLinkErrEnum.linkUnInvalid);
    expect(mocks.entitlement).not.toHaveBeenCalled();
  });

  it('propagates entitlement lookup failures instead of claiming an upgrade is required', async () => {
    mocks.entitlement.mockRejectedValueOnce(new Error('primary unavailable'));
    await expect(request()).rejects.toThrow('primary unavailable');
  });
});
