import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { PluginStatusEnum } from '@fastgpt/global/core/plugin/type';

const mocks = vi.hoisted(() => ({
  authCert: vi.fn(),
  getLocale: vi.fn(),
  getUserDetail: vi.fn(),
  getSystemToolList: vi.fn(),
  getSystemToolDetail: vi.fn(),
  getSystemToolDisplayInfo: vi.fn(),
  getSystemToolDisplayInfoWithChildIcons: vi.fn(),
  getInstance: vi.fn()
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

import {
  handler,
  type GetSystemPluginTemplatesBody
} from '@/pages/api/core/app/tool/getSystemToolTemplates';

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
      sources: ['system', 'team-1'],
      tags: ['life']
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

  it('filters soon offline and offline tools from root system tool candidates', async () => {
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
