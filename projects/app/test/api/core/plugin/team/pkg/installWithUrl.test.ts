import {
  createDefaultInstanceConfig,
  getTestInstanceConfig
} from '@test/utils/instanceConfigSnapshot';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Call } from '@test/utils/request';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';

const mocks = vi.hoisted(() => ({
  authUserPer: vi.fn(),
  assertTeamPluginInstallEnabled: vi.fn(),
  assertTeamPluginSourceReady: vi.fn(),
  upsertTeamInstalledPluginPolicy: vi.fn(),
  installPlugins: vi.fn()
}));

vi.mock('@fastgpt/service/support/permission/user/auth', () => ({
  authUserPer: mocks.authUserPer
}));

vi.mock('@fastgpt/service/core/plugin/teamPluginPolicy', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@fastgpt/service/core/plugin/teamPluginPolicy')>();
  return {
    assertTeamPluginInstallEnabled: () => {
      actual.assertTeamPluginInstallEnabled();
      mocks.assertTeamPluginInstallEnabled();
    },
    assertTeamPluginSourceReady: mocks.assertTeamPluginSourceReady,
    getRawPluginIdFromSystemToolId: (toolId: string) =>
      toolId.replace(/^systemTool-/, '').split('/')[0],
    upsertTeamInstalledPluginPolicy: mocks.upsertTeamInstalledPluginPolicy
  };
});

vi.mock('@fastgpt/service/thirdProvider/fastgptPlugin', () => ({
  pluginClient: {
    installPlugins: mocks.installPlugins
  }
}));

import handler from '@/pages/api/core/plugin/team/pkg/installWithUrl';

const plugin = {
  pluginId: 'weather',
  version: '1.0.0',
  etag: 'etag-weather',
  permission: ['userInfo:read']
};

describe('install team plugin from URL handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.systemInstanceConfig = createDefaultInstanceConfig();
    getTestInstanceConfig().feature.enableTeamPluginUpload = true;
    mocks.assertTeamPluginInstallEnabled.mockImplementation(() => undefined);
    mocks.authUserPer.mockResolvedValue({ teamId: 'team-1', tmbId: 'tmb-1' });
    mocks.installPlugins.mockResolvedValue({ failed: [] });
    mocks.assertTeamPluginSourceReady.mockResolvedValue(undefined);
    mocks.upsertTeamInstalledPluginPolicy.mockResolvedValue(undefined);
  });

  it('checks the feature gate before installing marketplace plugins', async () => {
    const res = await Call(handler, {
      body: {
        downloadUrls: ['https://marketplace.fastgpt.io/plugin/weather.pkg'],
        plugins: [plugin]
      }
    });

    expect(res.code).toBe(200);
    expect(mocks.assertTeamPluginInstallEnabled).toHaveBeenCalledOnce();
    expect(mocks.installPlugins).toHaveBeenCalledWith(
      ['https://marketplace.fastgpt.io/plugin/weather.pkg'],
      { source: 'teamId:team-1' }
    );

    getTestInstanceConfig().feature.enableTeamPluginUpload = false;
    const disabled = await Call(handler, {
      body: {
        downloadUrls: ['https://marketplace.fastgpt.io/plugin/weather.pkg'],
        plugins: [plugin]
      }
    });
    expect(disabled.error).toBe(TeamErrEnum.teamPluginInstallDisabled);
    expect(mocks.installPlugins).toHaveBeenCalledOnce();
  });

  it('does not call the plugin service when team installation is disabled', async () => {
    getTestInstanceConfig().feature.enableTeamPluginUpload = false;

    const res = await Call(handler, {
      body: {
        downloadUrls: ['https://marketplace.fastgpt.io/plugin/weather.pkg'],
        plugins: [plugin]
      }
    });

    expect(res.code).not.toBe(200);
    expect(res.error).toBe(TeamErrEnum.teamPluginInstallDisabled);
    expect(mocks.authUserPer).not.toHaveBeenCalled();
    expect(mocks.installPlugins).not.toHaveBeenCalled();
  });
});
