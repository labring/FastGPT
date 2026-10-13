import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Call } from '@test/utils/request';
import { PluginStatusEnum } from '@fastgpt/global/core/plugin/type';
import { TeamPluginPolicyStatusEnum } from '@fastgpt/global/core/plugin/schema/type';

const mocks = vi.hoisted(() => ({
  authUserPer: vi.fn(),
  getLocale: vi.fn(),
  getUserDetail: vi.fn(),
  getSystemToolList: vi.fn(),
  getInstance: vi.fn(),
  getTeamPluginPolicyMap: vi.fn(),
  pluginClient: {
    getDebugSessionStatus: vi.fn()
  }
}));

vi.mock('@fastgpt/service/support/permission/user/auth', () => ({
  authUserPer: mocks.authUserPer
}));

vi.mock('@fastgpt/service/common/middle/i18n', () => ({
  getLocale: mocks.getLocale
}));

vi.mock('@fastgpt/service/support/user/controller', () => ({
  getUserDetail: mocks.getUserDetail
}));

vi.mock('@fastgpt/service/core/app/tool/systemTool/systemTool.repo', () => ({
  SystemToolRepo: {
    getInstance: mocks.getInstance
  }
}));

vi.mock('@fastgpt/service/thirdProvider/fastgptPlugin', () => ({
  pluginClient: mocks.pluginClient
}));

vi.mock('@fastgpt/service/core/plugin/teamPluginPolicy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/core/plugin/teamPluginPolicy')>()),
  getTeamPluginPolicyMap: mocks.getTeamPluginPolicyMap
}));

import handler from '@/pages/api/core/plugin/team/tool/list';

describe('team system plugin list handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authUserPer.mockResolvedValue({
      teamId: 'team-1',
      tmbId: 'tmb-1',
      permission: {
        hasManagePer: false,
        isOwner: false
      }
    });
    mocks.getLocale.mockReturnValue('zh');
    mocks.getUserDetail.mockResolvedValue({ tags: [] });
    mocks.getInstance.mockReturnValue({
      getSystemToolList: mocks.getSystemToolList
    });
    mocks.getTeamPluginPolicyMap.mockResolvedValue(new Map());
    mocks.pluginClient.getDebugSessionStatus.mockResolvedValue({
      tmbId: 'tmb-1',
      source: 'debug:tmbId:tmb-1',
      status: 'connected',
      enabled: true,
      plugins: []
    });
    mocks.getSystemToolList.mockResolvedValue([
      {
        id: 'system-tool',
        version: '1.0.0',
        status: PluginStatusEnum.Normal,
        source: 'system',
        isToolSet: false,
        avatar: '',
        name: 'System Tool',
        intro: '',
        author: '',
        tags: [],
        currentCost: 0,
        systemKeyCost: 0,
        hasTokenFee: false,
        hasSystemSecret: false
      }
    ]);
  });

  it('adds current debug source from plugin service while keeping production sources', async () => {
    const res = await Call(handler, {
      query: {},
      auth: {
        teamId: 'team-1',
        tmbId: 'tmb-1'
      } as any
    });

    expect(res.code).toBe(200);
    expect(mocks.pluginClient.getDebugSessionStatus).toHaveBeenCalledWith({
      tmbId: 'tmb-1'
    });
    expect(mocks.getSystemToolList).toHaveBeenCalledWith({
      op: 'or',
      sources: ['system', 'teamId:team-1', 'debug:tmbId:tmb-1'],
      lang: 'zh'
    });
  });

  it('keeps production sources when debug channel is not active', async () => {
    mocks.pluginClient.getDebugSessionStatus.mockResolvedValueOnce({
      tmbId: 'tmb-1',
      status: 'revoked',
      enabled: false,
      plugins: []
    });

    await Call(handler, {
      query: {},
      auth: {
        teamId: 'team-1',
        tmbId: 'tmb-1'
      } as any
    });

    expect(mocks.getSystemToolList).toHaveBeenCalledWith({
      op: 'or',
      sources: ['system', 'teamId:team-1'],
      lang: 'zh'
    });
  });

  it('returns system and team installations independently for the same plugin', async () => {
    mocks.getSystemToolList.mockResolvedValueOnce([
      {
        id: 'systemTool-same-plugin',
        version: '1.0.0',
        status: PluginStatusEnum.Normal,
        source: 'system',
        isToolSet: false,
        avatar: '',
        name: 'Same Plugin',
        intro: '',
        author: '',
        tags: [],
        currentCost: 0,
        systemKeyCost: 0,
        hasTokenFee: false,
        hasSystemSecret: false
      },
      {
        id: 'systemTool-same-plugin',
        version: '1.0.0',
        status: PluginStatusEnum.Normal,
        source: 'teamId:team-1',
        isToolSet: false,
        avatar: '',
        name: 'Same Plugin',
        intro: '',
        author: '',
        tags: [],
        currentCost: 0,
        systemKeyCost: 0,
        hasTokenFee: false,
        hasSystemSecret: false
      }
    ]);
    mocks.getTeamPluginPolicyMap.mockResolvedValueOnce(
      new Map([
        [
          'same-plugin',
          {
            teamId: 'team-1',
            pluginId: 'same-plugin',
            pluginType: 'tool',
            installSource: 'marketplace',
            status: TeamPluginPolicyStatusEnum.installed,
            installed: true,
            version: '1.0.0',
            etag: 'etag-1'
          }
        ]
      ])
    );

    const res = await Call(handler, {
      query: {},
      auth: {
        teamId: 'team-1',
        tmbId: 'tmb-1'
      } as any
    });

    expect(res.code).toBe(200);
    expect(res.data).toEqual([
      expect.objectContaining({
        id: 'systemTool-same-plugin',
        source: 'teamId:team-1',
        registrySource: 'team',
        teamInstallStatus: TeamPluginPolicyStatusEnum.installed
      }),
      expect.objectContaining({
        id: 'systemTool-same-plugin',
        source: 'system',
        registrySource: 'system',
        teamInstallStatus: 'system'
      })
    ]);
  });

  it('does not return hidden or uninstalled system tools', async () => {
    mocks.getSystemToolList.mockResolvedValueOnce([
      {
        id: 'system-tool',
        version: '1.0.0',
        status: PluginStatusEnum.Normal,
        source: 'system',
        isToolSet: false,
        avatar: '',
        name: 'System Tool',
        intro: '',
        author: '',
        tags: [],
        currentCost: 0,
        systemKeyCost: 0,
        hasTokenFee: false,
        hasSystemSecret: false
      },
      {
        id: 'hidden-system-tool',
        version: '1.0.0',
        status: PluginStatusEnum.Hidden,
        source: 'system',
        isToolSet: false,
        avatar: '',
        name: 'Hidden System Tool',
        intro: '',
        author: '',
        tags: [],
        currentCost: 0,
        systemKeyCost: 0,
        hasTokenFee: false,
        hasSystemSecret: false
      },
      {
        id: 'uninstalled-system-tool',
        version: '1.0.0',
        status: PluginStatusEnum.Offline,
        source: 'system',
        isToolSet: false,
        avatar: '',
        name: 'Uninstalled System Tool',
        intro: '',
        author: '',
        tags: [],
        currentCost: 0,
        systemKeyCost: 0,
        hasTokenFee: false,
        hasSystemSecret: false
      }
    ]);
    const res = await Call(handler, {
      query: {},
      auth: {
        teamId: 'team-1',
        tmbId: 'tmb-1'
      } as any
    });

    expect(res.code).toBe(200);
    expect(res.data.map((tool) => tool.id)).toEqual(['system-tool']);
  });

  it('returns deleted team plugin placeholders when requested', async () => {
    mocks.getTeamPluginPolicyMap.mockResolvedValueOnce(
      new Map([
        [
          'team-tool',
          {
            teamId: 'team-1',
            pluginId: 'team-tool',
            pluginType: 'tool',
            installSource: 'marketplace',
            status: TeamPluginPolicyStatusEnum.deleted,
            installed: false,
            version: '1.0.0',
            etag: 'etag-1'
          }
        ]
      ])
    );

    const res = await Call(handler, {
      query: {
        includeDeleted: true,
        source: 'team'
      },
      auth: {
        teamId: 'team-1',
        tmbId: 'tmb-1'
      } as any
    });

    expect(res.code).toBe(200);
    expect(res.data).toEqual([
      expect.objectContaining({
        id: 'systemTool-team-tool',
        source: 'teamId:team-1',
        registrySource: 'team',
        teamInstallStatus: TeamPluginPolicyStatusEnum.deleted,
        installedVersion: '1.0.0',
        installedEtag: 'etag-1'
      })
    ]);
  });

  it('does not mix deleted team placeholders into system source list', async () => {
    mocks.getTeamPluginPolicyMap.mockResolvedValueOnce(
      new Map([
        [
          'team-tool',
          {
            teamId: 'team-1',
            pluginId: 'team-tool',
            pluginType: 'tool',
            installSource: 'marketplace',
            status: TeamPluginPolicyStatusEnum.deleted,
            installed: false,
            version: '1.0.0',
            etag: 'etag-1'
          }
        ]
      ])
    );

    const res = await Call(handler, {
      query: {
        includeDeleted: true,
        source: 'system'
      },
      auth: {
        teamId: 'team-1',
        tmbId: 'tmb-1'
      } as any
    });

    expect(res.code).toBe(200);
    expect(res.data).toHaveLength(1);
    expect(res.data[0]).toEqual(
      expect.objectContaining({
        id: 'system-tool',
        registrySource: 'system',
        source: 'system'
      })
    );
  });
});
