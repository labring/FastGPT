import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ApiRequestProps } from '@fastgpt/service/type/next';

const mocks = vi.hoisted(() => ({
  authCert: vi.fn(),
  getLocale: vi.fn(),
  getUserDetail: vi.fn(),
  getSystemToolList: vi.fn(),
  getSystemToolDetail: vi.fn(),
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
      getSystemToolDetail: mocks.getSystemToolDetail
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
        tags: ['life']
      },
      {
        id: 'math',
        name: 'Math',
        intro: 'Calculator',
        toolDescription: 'Compute numbers',
        isToolSet: false,
        tags: ['calc']
      },
      {
        id: 'hidden-weather',
        name: 'Hidden Weather',
        intro: 'Forecast lookup',
        toolDescription: 'Get weather',
        isToolSet: false,
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
    mocks.getSystemToolDetail.mockResolvedValue({
      id: 'toolset',
      name: 'Toolset',
      intro: 'Parent intro',
      avatar: 'parent-icon',
      children: [
        {
          id: 'plus',
          name: 'A+B Tool',
          description: 'Exact plus',
          toolDescription: 'Use literal plus',
          currentCost: 2,
          systemKeyCost: 0.5
        },
        {
          id: 'regex-like',
          name: 'AxxB Tool',
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
      currentCost: 2,
      systemKeyCost: 0.5,
      hasTokenFee: true
    });
    expect(mocks.getSystemToolDetail).toHaveBeenCalledWith({
      pluginId: 'toolset',
      lang: 'zh',
      source: 'system'
    });
  });
});
