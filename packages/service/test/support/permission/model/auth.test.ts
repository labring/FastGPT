import { assertMemberModelPermission } from '@fastgpt/service/support/permission/model/policy';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  authModelManage,
  authModelScopeOperation
} from '@fastgpt/service/support/permission/model/auth';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { SystemErrEnum } from '@fastgpt/global/common/error/code/system';
import type { TeamPermission } from '@fastgpt/global/support/permission/user/controller';

beforeEach(() => {
  global.feConfigs = { isPlus: true } as typeof global.feConfigs;
});
describe('model management guards', () => {
  it('assertMemberModelPermission requires TeamModelCreatePermissionVal and maps the resource error code', async () => {
    await expect(
      assertMemberModelPermission({ hasModelCreatePer: false } as TeamPermission)
    ).rejects.toBe(ModelErrEnum.unAuthModel);
    await expect(
      assertMemberModelPermission({ hasModelCreatePer: false } as TeamPermission, 'channel')
    ).rejects.toBe(ModelErrEnum.unAuthChannel);
    await expect(
      assertMemberModelPermission({ hasModelCreatePer: true } as TeamPermission)
    ).resolves.toBeUndefined();
  });

  describe('authModelScopeOperation', () => {
    it('rejects non-root for system channelType with rootOnlyPermit', async () => {
      const authUserPerSpy = vi
        .spyOn(await import('@fastgpt/service/support/permission/user/auth'), 'authUserPer')
        .mockResolvedValue({
          tmbId: 'tmb-1',
          teamId: 'team-1',
          isRoot: false,
          tmb: { permission: { hasModelCreatePer: true } }
        } as any);

      await expect(authModelScopeOperation({ req: {}, channelType: 'system' })).rejects.toBe(
        ModelErrEnum.rootOnlyPermit
      );

      authUserPerSpy.mockRestore();
    });

    it('allows root for system channelType', async () => {
      const authUserPerSpy = vi
        .spyOn(await import('@fastgpt/service/support/permission/user/auth'), 'authUserPer')
        .mockResolvedValue({
          tmbId: 'tmb-root',
          teamId: 'team-1',
          isRoot: true,
          tmb: { permission: {} }
        } as any);

      const res = await authModelScopeOperation({ req: {}, channelType: 'system' });
      expect(res.isRoot).toBe(true);

      authUserPerSpy.mockRestore();
    });

    it('resolves authenticated member session for team scope', async () => {
      const authUserPerSpy = vi
        .spyOn(await import('@fastgpt/service/support/permission/user/auth'), 'authUserPer')
        .mockResolvedValue({
          tmbId: 'tmb-1',
          teamId: 'team-1',
          isRoot: false,
          tmb: { permission: { hasModelCreatePer: false } }
        } as any);

      const res = await authModelScopeOperation({
        req: {},
        channelType: 'team'
      });
      expect(res.tmbId).toBe('tmb-1');

      authUserPerSpy.mockRestore();
    });
  });
  describe('authModelManage', () => {
    const mockAuth = async (auth: Record<string, unknown>) =>
      vi
        .spyOn(await import('@fastgpt/service/support/permission/user/auth'), 'authUserPer')
        .mockResolvedValue(auth as any);

    it('rejects team scope on the open-source edition for members and root, keeps system scope', async () => {
      global.feConfigs = { isPlus: false } as typeof global.feConfigs;
      const memberSpy = await mockAuth({
        tmbId: 'tmb-1',
        teamId: 'team-1',
        isRoot: false,
        tmb: { permission: { hasModelCreatePer: true } }
      });
      await expect(authModelManage({ req: {}, channelType: 'team' })).rejects.toBe(
        SystemErrEnum.commercialFeature
      );
      memberSpy.mockRestore();

      const rootSpy = await mockAuth({
        tmbId: 'tmb-root',
        teamId: 'team-1',
        isRoot: true,
        tmb: { permission: {} }
      });
      await expect(authModelManage({ req: {}, channelType: 'team' })).rejects.toBe(
        SystemErrEnum.commercialFeature
      );
      await expect(authModelManage({ req: {}, channelType: 'system' })).resolves.toMatchObject({
        isRoot: true
      });
      rootSpy.mockRestore();
    });

    it('rejects team scope when enable_team_model is false for members and root', async () => {
      global.feConfigs = { isPlus: true, enable_team_model: false } as typeof global.feConfigs;
      const memberSpy = await mockAuth({
        tmbId: 'tmb-1',
        teamId: 'team-1',
        isRoot: false,
        tmb: { permission: { hasModelCreatePer: true } }
      });
      await expect(authModelManage({ req: {}, channelType: 'team' })).rejects.toBe(
        ModelErrEnum.teamModelDisabled
      );
      memberSpy.mockRestore();

      const rootSpy = await mockAuth({
        tmbId: 'tmb-root',
        teamId: 'team-1',
        isRoot: true,
        tmb: { permission: {} }
      });
      await expect(authModelManage({ req: {}, channelType: 'team' })).rejects.toBe(
        ModelErrEnum.teamModelDisabled
      );
      rootSpy.mockRestore();
    });

    it('rejects a member without hasModelCreatePer on team scope', async () => {
      const spy = await mockAuth({
        tmbId: 'tmb-1',
        teamId: 'team-1',
        isRoot: false,
        tmb: { permission: { hasModelCreatePer: false } }
      });

      await expect(authModelManage({ req: {}, channelType: 'team' })).rejects.toBe(
        ModelErrEnum.unAuthModel
      );
      await expect(
        authModelManage({ req: {}, channelType: 'team', resource: 'channel' })
      ).rejects.toBe(ModelErrEnum.unAuthChannel);
      spy.mockRestore();
    });

    it('allows a member with hasModelCreatePer on team scope', async () => {
      const spy = await mockAuth({
        tmbId: 'tmb-1',
        teamId: 'team-1',
        isRoot: false,
        tmb: { permission: { hasModelCreatePer: true } }
      });

      const res = await authModelManage({ req: {}, channelType: 'team' });
      expect(res.tmbId).toBe('tmb-1');
      spy.mockRestore();
    });

    it('rejects a member on system scope before the permission check', async () => {
      const spy = await mockAuth({
        tmbId: 'tmb-1',
        teamId: 'team-1',
        isRoot: false,
        tmb: { permission: { hasModelCreatePer: true } }
      });

      await expect(authModelManage({ req: {}, channelType: 'system' })).rejects.toBe(
        ModelErrEnum.rootOnlyPermit
      );
      spy.mockRestore();
    });

    it('does not require hasModelCreatePer for root', async () => {
      const spy = await mockAuth({
        tmbId: 'tmb-root',
        teamId: 'team-1',
        isRoot: true,
        tmb: { permission: { hasModelCreatePer: false } }
      });

      await expect(authModelManage({ req: {}, channelType: 'system' })).resolves.toMatchObject({
        isRoot: true
      });
      await expect(authModelManage({ req: {}, channelType: 'team' })).resolves.toMatchObject({
        isRoot: true
      });
      spy.mockRestore();
    });
  });
});
