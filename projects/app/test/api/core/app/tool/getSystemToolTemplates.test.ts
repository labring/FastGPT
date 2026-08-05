import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { PluginStatusEnum } from '@fastgpt/global/core/plugin/type';
import { WorkflowStart } from '@fastgpt/global/core/workflow/template/system/workflowStart';

const mocks = vi.hoisted(() => ({
  authCert: vi.fn(),
  getLocale: vi.fn(),
  getUserDetail: vi.fn(),
  getSystemToolList: vi.fn(),
  getSystemToolDetail: vi.fn(),
  getSystemToolDisplayInfo: vi.fn(),
  getSystemToolDisplayInfoWithChildIcons: vi.fn(),
  getClientToolPreviewNode: vi.fn(),
  getInstance: vi.fn(),
  getTeamPluginPolicyMap: vi.fn(),
  assertTeamPluginSourceAccess: vi.fn(),
  pluginClient: {
    getDebugSessionStatus: vi.fn()
  }
}));

vi.mock('@fastgpt/service/support/permission/auth/common', () => ({
  authCert: mocks.authCert
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
  getTeamPluginPolicyMap: mocks.getTeamPluginPolicyMap,
  assertTeamPluginSourceAccess: mocks.assertTeamPluginSourceAccess
}));

vi.mock('@fastgpt/service/core/app/tool/utils/client', () => ({
  getClientToolPreviewNode: mocks.getClientToolPreviewNode
}));

import {
  handler,
  type GetSystemPluginTemplatesBody
} from '@/pages/api/core/app/tool/getSystemToolTemplates';
import { getAuthorizedSystemToolTemplateCatalog } from '@fastgpt/service/core/app/tool/systemTool/capability';

describe('get system tool templates handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authCert.mockResolvedValue({
      teamId: 'team-1',
      tmbId: 'tmb-1',
      isRoot: false
    });
    mocks.getLocale.mockReturnValue('zh');
    mocks.getUserDetail.mockResolvedValue({ tags: ['hidden-user'] });
    mocks.getInstance.mockReturnValue({
      getSystemToolList: mocks.getSystemToolList,
      getSystemToolDetail: mocks.getSystemToolDetail,
      getSystemToolDisplayInfo: mocks.getSystemToolDisplayInfo,
      getSystemToolDisplayInfoWithChildIcons: mocks.getSystemToolDisplayInfoWithChildIcons
    });
    mocks.getTeamPluginPolicyMap.mockResolvedValue(new Map());
    mocks.assertTeamPluginSourceAccess.mockResolvedValue('teamId:team-1');
    mocks.pluginClient.getDebugSessionStatus.mockResolvedValue({
      tmbId: 'tmb-1',
      status: 'revoked',
      enabled: false,
      plugins: []
    });
    mocks.getClientToolPreviewNode.mockImplementation(
      async ({ appId, source }: { appId: string; source: string }) => ({
        ...structuredClone(WorkflowStart),
        id: appId,
        source
      })
    );
  });

  it('filters root system tools by searchKey', async () => {
    mocks.getSystemToolList.mockResolvedValue([
      {
        id: 'weather',
        name: 'Weather',
        intro: 'Forecast lookup',
        toolDescription: 'Get weather',
        isToolSet: false,
        status: PluginStatusEnum.Normal,
        tags: ['life']
      },
      {
        id: 'math',
        name: 'Math',
        intro: 'Calculator',
        toolDescription: 'Compute numbers',
        isToolSet: false,
        status: PluginStatusEnum.Normal,
        tags: ['calc']
      },
      {
        id: 'hidden-weather',
        name: 'Hidden Weather',
        intro: 'Forecast lookup',
        toolDescription: 'Get weather',
        isToolSet: false,
        status: PluginStatusEnum.Normal,
        tags: ['life'],
        hideTags: ['hidden-user']
      }
    ]);

    const result = await handler({
      body: {
        searchKey: 'weather',
        tags: ['life']
      }
    } as ApiRequestProps<GetSystemPluginTemplatesBody>);

    expect(result.map((item) => item.id)).toEqual(['weather']);
    expect(mocks.getSystemToolList).toHaveBeenCalledWith({
      lang: 'zh',
      op: 'or',
      sources: ['system', 'teamId:team-1'],
      tags: ['life']
    });
  });

  it('builds a request-scoped catalog from only the current user visible tools', async () => {
    mocks.getSystemToolList.mockResolvedValue([
      {
        id: 'systemTool-weather',
        source: 'system',
        name: 'Weather',
        intro: '',
        toolDescription: '',
        isToolSet: false,
        status: PluginStatusEnum.Normal,
        tags: []
      },
      {
        id: 'systemTool-suite',
        source: 'team-1',
        name: 'Team suite',
        intro: '',
        toolDescription: '',
        isToolSet: true,
        status: PluginStatusEnum.Normal,
        tags: []
      },
      {
        id: 'systemTool-hidden',
        source: 'system',
        name: 'Hidden',
        intro: '',
        toolDescription: '',
        isToolSet: false,
        status: PluginStatusEnum.Normal,
        tags: [],
        hideTags: ['hidden-user']
      }
    ]);
    mocks.getSystemToolDisplayInfoWithChildIcons.mockResolvedValue({
      id: 'systemTool-suite',
      source: 'team-1',
      name: 'Team suite',
      intro: '',
      avatar: '',
      status: PluginStatusEnum.Normal,
      children: [
        {
          id: 'search',
          name: 'Search',
          status: PluginStatusEnum.Normal,
          description: '',
          currentCost: 0,
          systemKeyCost: 0
        },
        {
          id: 'offline',
          name: 'Offline',
          status: PluginStatusEnum.Offline,
          description: '',
          currentCost: 0,
          systemKeyCost: 0
        }
      ],
      hasTokenFee: false
    });

    const result = await getAuthorizedSystemToolTemplateCatalog({
      teamId: 'team-1',
      tmbId: 'tmb-1',
      isRoot: false,
      lang: 'zh'
    });

    expect(result.map(({ toolId, source }) => ({ toolId, source }))).toEqual([
      { toolId: 'systemTool-weather', source: 'system' },
      { toolId: 'systemTool-suite', source: 'team-1' },
      { toolId: 'systemTool-suite/search', source: 'team-1' }
    ]);
    expect(mocks.getClientToolPreviewNode).toHaveBeenCalledTimes(3);
    expect(mocks.getClientToolPreviewNode).toHaveBeenCalledWith({
      appId: 'systemTool-suite/search',
      source: 'team-1',
      getLatestVersion: true,
      lang: 'zh'
    });
  });

  it('keeps production tools when a debug session is active', async () => {
    mocks.pluginClient.getDebugSessionStatus.mockResolvedValueOnce({
      tmbId: 'tmb-1',
      source: 'debug:tmbId:tmb-1',
      status: 'connected',
      enabled: true,
      plugins: []
    });
    mocks.getSystemToolList.mockResolvedValue([
      {
        id: 'debug-tool',
        source: 'debug:tmbId:tmb-1',
        name: 'Debug Tool',
        intro: '',
        toolDescription: '',
        isToolSet: false,
        status: PluginStatusEnum.Normal,
        tags: []
      },
      {
        id: 'system-tool',
        source: 'system',
        name: 'System Tool',
        intro: '',
        toolDescription: '',
        isToolSet: false,
        status: PluginStatusEnum.Normal,
        tags: []
      }
    ]);

    const result = await handler({
      body: {}
    } as ApiRequestProps<GetSystemPluginTemplatesBody>);

    expect(result.map((item) => item.id)).toEqual(['debug-tool', 'system-tool']);
    expect(result[0]?.source).toBe('debug:tmbId:tmb-1');
    expect(mocks.pluginClient.getDebugSessionStatus).toHaveBeenCalledWith({
      tmbId: 'tmb-1'
    });
    expect(mocks.getSystemToolList).toHaveBeenCalledWith({
      lang: 'zh',
      op: 'or',
      sources: ['system', 'teamId:team-1', 'debug:tmbId:tmb-1'],
      tags: undefined
    });
  });

  it('keeps production tools when debug channel is not active', async () => {
    mocks.getSystemToolList.mockResolvedValue([]);

    await handler({
      body: {}
    } as ApiRequestProps<GetSystemPluginTemplatesBody>);

    expect(mocks.getSystemToolList).toHaveBeenCalledWith({
      lang: 'zh',
      op: 'or',
      sources: ['system', 'teamId:team-1'],
      tags: undefined
    });
  });

  it('automatically appends the active debug source for root templates', async () => {
    mocks.pluginClient.getDebugSessionStatus.mockResolvedValueOnce({
      tmbId: 'tmb-1',
      source: 'debug:tmbId:tmb-1',
      status: 'connected',
      enabled: true,
      plugins: []
    });
    mocks.getSystemToolList.mockResolvedValue([]);

    await handler({
      body: {}
    } as ApiRequestProps<GetSystemPluginTemplatesBody>);

    expect(mocks.pluginClient.getDebugSessionStatus).toHaveBeenCalledWith({
      tmbId: 'tmb-1'
    });
    expect(mocks.getSystemToolList).toHaveBeenCalledWith({
      lang: 'zh',
      op: 'or',
      sources: ['system', 'teamId:team-1', 'debug:tmbId:tmb-1'],
      tags: undefined
    });
  });

  it('filters toolset children by escaped searchKey', async () => {
    mocks.getSystemToolDisplayInfoWithChildIcons.mockResolvedValue({
      id: 'toolset',
      name: 'Toolset',
      intro: 'Parent intro',
      avatar: 'parent-icon',
      status: PluginStatusEnum.Normal,
      children: [
        {
          id: 'plus',
          name: 'A+B Tool',
          status: PluginStatusEnum.Normal,
          description: 'Exact plus',
          toolDescription: 'Use literal plus',
          icon: 'plus-icon',
          currentCost: 2,
          systemKeyCost: 0.5
        },
        {
          id: 'regex-like',
          name: 'AxxB Tool',
          status: PluginStatusEnum.Normal,
          description: 'Would match an unescaped regex',
          toolDescription: 'No literal plus',
          currentCost: 3,
          systemKeyCost: 1
        }
      ],
      hasTokenFee: true
    });

    const result = await handler({
      body: {
        parentId: 'toolset',
        searchKey: 'A+B'
      }
    } as ApiRequestProps<GetSystemPluginTemplatesBody>);

    expect(result.map((item) => item.id)).toEqual(['toolset/plus']);
    expect(result[0]).toMatchObject({
      avatar: 'plus-icon',
      currentCost: 2,
      systemKeyCost: 0.5,
      hasTokenFee: true
    });
    expect(mocks.getSystemToolDisplayInfoWithChildIcons).toHaveBeenCalledWith({
      pluginId: 'toolset',
      lang: 'zh',
      source: 'system'
    });
    expect(mocks.getSystemToolDisplayInfo).not.toHaveBeenCalled();
    expect(mocks.getSystemToolDetail).not.toHaveBeenCalled();
  });

  it('uses the parent tool source when opening a production toolset during debug', async () => {
    mocks.pluginClient.getDebugSessionStatus.mockResolvedValueOnce({
      tmbId: 'tmb-1',
      source: 'debug:tmbId:tmb-1',
      status: 'connected',
      enabled: true,
      plugins: []
    });
    mocks.getSystemToolDisplayInfoWithChildIcons.mockResolvedValue({
      id: 'systemTool-toolset',
      name: 'Production Toolset',
      intro: '',
      avatar: '',
      status: PluginStatusEnum.Normal,
      source: 'system',
      children: [
        {
          id: 'child',
          name: 'Production Child',
          status: PluginStatusEnum.Normal,
          description: '',
          currentCost: 0,
          systemKeyCost: 0
        }
      ],
      hasTokenFee: false
    });

    const result = await handler({
      body: {
        parentId: 'systemTool-toolset',
        source: 'system'
      }
    } as ApiRequestProps<GetSystemPluginTemplatesBody>);

    expect(result.map((item) => item.id)).toEqual(['systemTool-toolset/child']);
    expect(mocks.pluginClient.getDebugSessionStatus).not.toHaveBeenCalled();
    expect(mocks.getSystemToolDisplayInfoWithChildIcons).toHaveBeenCalledWith({
      pluginId: 'systemTool-toolset',
      lang: 'zh',
      source: 'system'
    });
  });

  it('filters hidden, soon offline and offline tools from root system tool candidates', async () => {
    mocks.getSystemToolList.mockResolvedValue([
      {
        id: 'normal-tool',
        name: 'Normal Tool',
        intro: '',
        toolDescription: '',
        isToolSet: false,
        status: PluginStatusEnum.Normal,
        tags: []
      },
      {
        id: 'hidden-tool',
        name: 'Hidden Tool',
        intro: '',
        toolDescription: '',
        isToolSet: false,
        status: PluginStatusEnum.Hidden,
        tags: []
      },
      {
        id: 'soon-offline-tool',
        name: 'Soon Offline Tool',
        intro: '',
        toolDescription: '',
        isToolSet: false,
        status: PluginStatusEnum.SoonOffline,
        tags: []
      },
      {
        id: 'offline-tool',
        name: 'Offline Tool',
        intro: '',
        toolDescription: '',
        isToolSet: false,
        status: PluginStatusEnum.Offline,
        tags: []
      }
    ]);

    const result = await handler({
      body: {}
    } as ApiRequestProps<GetSystemPluginTemplatesBody>);

    expect(result.map((item) => item.id)).toEqual(['normal-tool']);
  });

  it('filters unavailable toolset children from system tool candidates', async () => {
    mocks.getSystemToolDisplayInfoWithChildIcons.mockResolvedValue({
      id: 'toolset',
      name: 'Toolset',
      intro: 'Parent intro',
      avatar: 'parent-icon',
      status: PluginStatusEnum.Normal,
      children: [
        {
          id: 'normal-child',
          name: 'Normal Child',
          status: PluginStatusEnum.Normal,
          description: '',
          currentCost: 1,
          systemKeyCost: 0
        },
        {
          id: 'hidden-child',
          name: 'Hidden Child',
          status: PluginStatusEnum.Hidden,
          description: '',
          currentCost: 1,
          systemKeyCost: 0
        },
        {
          id: 'soon-offline-child',
          name: 'Soon Offline Child',
          status: PluginStatusEnum.SoonOffline,
          description: '',
          currentCost: 1,
          systemKeyCost: 0
        },
        {
          id: 'offline-child',
          name: 'Offline Child',
          status: PluginStatusEnum.Offline,
          description: '',
          currentCost: 1,
          systemKeyCost: 0
        }
      ],
      hasTokenFee: false
    });

    const result = await handler({
      body: {
        parentId: 'toolset'
      }
    } as ApiRequestProps<GetSystemPluginTemplatesBody>);

    expect(result.map((item) => item.id)).toEqual(['toolset/normal-child']);
    expect(mocks.getSystemToolDisplayInfoWithChildIcons).toHaveBeenCalledWith({
      pluginId: 'toolset',
      lang: 'zh',
      source: 'system'
    });
    expect(mocks.getSystemToolDetail).not.toHaveBeenCalled();
  });

  it('returns no children when parent toolset is unavailable', async () => {
    mocks.getSystemToolDisplayInfoWithChildIcons.mockResolvedValue({
      id: 'toolset',
      name: 'Toolset',
      intro: 'Parent intro',
      avatar: 'parent-icon',
      status: PluginStatusEnum.Offline,
      children: [
        {
          id: 'normal-child',
          name: 'Normal Child',
          status: PluginStatusEnum.Normal,
          description: '',
          currentCost: 1,
          systemKeyCost: 0
        }
      ],
      hasTokenFee: false
    });

    const result = await handler({
      body: {
        parentId: 'toolset'
      }
    } as ApiRequestProps<GetSystemPluginTemplatesBody>);

    expect(result).toEqual([]);
    expect(mocks.getSystemToolDetail).not.toHaveBeenCalled();
  });
});
