import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Call } from '@test/utils/request';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { TeamManagePermissionVal } from '@fastgpt/global/support/permission/user/constant';

const mocks = vi.hoisted(() => ({
  authUserPer: vi.fn(),
  assertTeamPluginInstallEnabled: vi.fn(),
  assertTeamPluginSourceReady: vi.fn(),
  upsertTeamInstalledPluginPolicy: vi.fn(),
  confirmPlugin: vi.fn()
}));

vi.mock('@fastgpt/service/support/permission/user/auth', () => ({
  authUserPer: mocks.authUserPer
}));

vi.mock('@fastgpt/service/core/plugin/teamPluginPolicy', () => ({
  assertTeamPluginInstallEnabled: mocks.assertTeamPluginInstallEnabled,
  assertTeamPluginSourceReady: mocks.assertTeamPluginSourceReady,
  getRawPluginIdFromSystemToolId: (toolId: string) =>
    toolId.replace(/^systemTool-/, '').split('/')[0],
  upsertTeamInstalledPluginPolicy: mocks.upsertTeamInstalledPluginPolicy
}));

vi.mock('@fastgpt/service/thirdProvider/fastgptPlugin', () => ({
  pluginClient: {
    confirmPlugin: mocks.confirmPlugin
  }
}));

import handler from '@/pages/api/core/plugin/team/pkg/confirm';

const tool = {
  pluginId: 'systemTool-weather',
  version: '1.0.0',
  etag: 'etag-weather',
  permission: ['userInfo:read']
};

describe('confirm team plugin package handler', () => {
  const originalEnableTeamPluginUpload = global.feConfigs?.enable_team_plugin_upload;

  beforeEach(() => {
    vi.clearAllMocks();
    global.feConfigs = {
      ...global.feConfigs,
      enable_team_plugin_upload: true
    } as any;
    mocks.assertTeamPluginInstallEnabled.mockImplementation(() => undefined);
    mocks.authUserPer.mockResolvedValue({ teamId: 'team-1', tmbId: 'tmb-1' });
    mocks.confirmPlugin.mockResolvedValue({
      confirmed: [{ ...tool, pluginId: 'weather' }],
      failed: []
    });
    mocks.assertTeamPluginSourceReady.mockResolvedValue(undefined);
    mocks.upsertTeamInstalledPluginPolicy.mockResolvedValue(undefined);
  });

  afterEach(() => {
    global.feConfigs = {
      ...global.feConfigs,
      enable_team_plugin_upload: originalEnableTeamPluginUpload
    } as any;
  });

  it('writes the team policy after all plugins are confirmed', async () => {
    const res = await Call(handler, { body: { toolIds: [tool] } });

    expect(res.code).toBe(200);
    expect(mocks.authUserPer).toHaveBeenCalledWith(
      expect.objectContaining({
        authToken: true,
        per: TeamManagePermissionVal
      })
    );
    expect(mocks.confirmPlugin).toHaveBeenCalledWith([{ ...tool, pluginId: 'weather' }], {
      source: 'teamId:team-1'
    });
    expect(mocks.assertTeamPluginSourceReady).toHaveBeenCalledWith({
      teamId: 'team-1',
      tools: [tool]
    });
    expect(mocks.upsertTeamInstalledPluginPolicy).toHaveBeenCalled();
  });

  it('does not write the team policy when any plugin confirmation fails', async () => {
    mocks.confirmPlugin.mockResolvedValueOnce({
      confirmed: [],
      failed: [
        {
          uniqueId: { pluginId: 'weather', version: '1.0.0', etag: 'etag-weather' },
          reason: { en: 'Confirm failed' }
        }
      ]
    });

    const res = await Call(handler, { body: { toolIds: [tool] } });

    expect(res.code).not.toBe(200);
    expect(mocks.assertTeamPluginSourceReady).not.toHaveBeenCalled();
    expect(mocks.upsertTeamInstalledPluginPolicy).not.toHaveBeenCalled();
  });

  it('does not confirm plugins when the installation feature is disabled', async () => {
    mocks.assertTeamPluginInstallEnabled.mockImplementationOnce(() => {
      throw TeamErrEnum.teamPluginInstallDisabled;
    });

    const res = await Call(handler, { body: { toolIds: [tool] } });

    expect(res.code).not.toBe(200);
    expect(res.error).toBe(TeamErrEnum.teamPluginInstallDisabled);
    expect(mocks.confirmPlugin).not.toHaveBeenCalled();
  });
});
