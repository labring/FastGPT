import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Call } from '@test/utils/request';

const mocks = vi.hoisted(() => ({
  authUserPer: vi.fn(),
  assertTeamPluginInstalled: vi.fn(),
  setTeamPluginDeleted: vi.fn(),
  pluginClient: {
    deletePlugin: vi.fn()
  }
}));

vi.mock('@fastgpt/service/support/permission/user/auth', () => ({
  authUserPer: mocks.authUserPer
}));

vi.mock('@fastgpt/service/core/plugin/teamPluginPolicy', () => ({
  assertTeamPluginInstalled: mocks.assertTeamPluginInstalled,
  getRawPluginIdFromSystemToolId: (toolId: string) =>
    toolId.replace(/^systemTool-/, '').split('/')[0],
  setTeamPluginDeleted: mocks.setTeamPluginDeleted
}));

vi.mock('@fastgpt/service/thirdProvider/fastgptPlugin', () => ({
  pluginClient: mocks.pluginClient
}));

import handler from '@/pages/api/core/plugin/team/tool/delete';

describe('delete team plugin handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authUserPer.mockResolvedValue({
      teamId: 'team-1',
      tmbId: 'tmb-1'
    });
    mocks.assertTeamPluginInstalled.mockResolvedValue({
      pluginId: 'weather',
      version: '1.0.0',
      status: 'installed'
    });
    mocks.pluginClient.deletePlugin.mockResolvedValue(undefined);
    mocks.setTeamPluginDeleted.mockResolvedValue(undefined);
  });

  it('deletes the package from the typed team source before updating policy', async () => {
    const res = await Call(handler, {
      body: {
        pluginId: 'systemTool-weather'
      }
    });

    expect(res.code).toBe(200);
    expect(mocks.assertTeamPluginInstalled).toHaveBeenCalledWith({
      teamId: 'team-1',
      pluginId: 'weather'
    });
    expect(mocks.pluginClient.deletePlugin).toHaveBeenCalledWith({
      pluginId: 'weather',
      source: 'teamId:team-1',
      version: '1.0.0'
    });
    expect(mocks.setTeamPluginDeleted).toHaveBeenCalledWith({
      teamId: 'team-1',
      tmbId: 'tmb-1',
      pluginId: 'weather'
    });
    expect(mocks.pluginClient.deletePlugin.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.setTeamPluginDeleted.mock.invocationCallOrder[0]
    );
  });

  it('does not update policy when the package version is unknown', async () => {
    mocks.assertTeamPluginInstalled.mockResolvedValueOnce({
      pluginId: 'weather',
      status: 'installed'
    });

    const res = await Call(handler, {
      body: {
        pluginId: 'systemTool-weather'
      }
    });

    expect(res.code).not.toBe(200);
    expect(mocks.pluginClient.deletePlugin).not.toHaveBeenCalled();
    expect(mocks.setTeamPluginDeleted).not.toHaveBeenCalled();
  });
});
