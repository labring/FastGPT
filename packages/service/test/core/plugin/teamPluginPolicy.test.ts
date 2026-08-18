import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findOne: vi.fn(),
  getInstance: vi.fn()
}));

vi.mock('@fastgpt/service/core/plugin/schema/teamInstalledPluginSchema', () => ({
  MongoTeamInstalledPlugin: {
    findOne: mocks.findOne
  }
}));

vi.mock('@fastgpt/service/core/app/tool/systemTool/systemTool.repo', () => ({
  SystemToolRepo: {
    getInstance: mocks.getInstance
  }
}));

import { assertTeamPluginSourceAccess } from '@fastgpt/service/core/plugin/teamPluginPolicy';

describe('assertTeamPluginSourceAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects a source owned by another team before reading policy', async () => {
    await expect(
      assertTeamPluginSourceAccess({
        teamId: 'team-a',
        source: 'teamId:team-b',
        pluginId: 'weather'
      })
    ).rejects.toBe('plugin.team_source_forbidden');

    expect(mocks.findOne).not.toHaveBeenCalled();
  });

  it('allows an installed plugin from the current team source', async () => {
    mocks.findOne.mockReturnValueOnce({
      lean: vi.fn().mockResolvedValue({
        teamId: 'team-a',
        pluginId: 'weather',
        pluginType: 'tool',
        status: 'installed',
        installed: true
      })
    });

    await expect(
      assertTeamPluginSourceAccess({
        teamId: 'team-a',
        source: 'teamId:team-a',
        pluginId: 'weather'
      })
    ).resolves.toBe('teamId:team-a');

    expect(mocks.findOne).toHaveBeenCalledWith({
      teamId: 'team-a',
      pluginId: 'weather'
    });
  });
});
