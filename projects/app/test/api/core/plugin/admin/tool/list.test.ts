import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { SystemToolSystemSecretStatusEnum } from '@fastgpt/global/core/app/tool/systemTool/constants';

const mocks = vi.hoisted(() => ({
  authSystemAdmin: vi.fn(),
  getLocale: vi.fn(),
  getInstance: vi.fn(),
  getSystemToolList: vi.fn(),
  findTags: vi.fn(),
  leanTags: vi.fn()
}));

vi.mock('@fastgpt/service/support/permission/user/auth', () => ({
  authSystemAdmin: mocks.authSystemAdmin
}));

vi.mock('@fastgpt/service/common/middle/i18n', () => ({
  getLocale: mocks.getLocale
}));

vi.mock('@fastgpt/service/core/app/tool/systemTool/systemTool.repo', () => ({
  SystemToolRepo: {
    getInstance: mocks.getInstance
  }
}));

vi.mock('@fastgpt/service/core/plugin/tool/tagSchema', () => ({
  MongoPluginToolTag: {
    find: mocks.findTags
  }
}));

import { handler } from '@/pages/api/core/plugin/admin/tool/list';

describe('admin system tool list handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authSystemAdmin.mockResolvedValue(undefined);
    mocks.getLocale.mockReturnValue('zh-CN');
    mocks.getInstance.mockReturnValue({
      getSystemToolList: mocks.getSystemToolList
    });
    mocks.findTags.mockReturnValue({
      lean: mocks.leanTags
    });
    mocks.leanTags.mockResolvedValue([
      {
        tagId: 'search',
        tagName: {
          en: 'Search',
          'zh-CN': '搜索'
        }
      },
      {
        tagId: 'unused',
        tagName: {
          en: 'Unused',
          'zh-CN': '未使用'
        }
      }
    ]);
  });

  it('returns admin tools with etag and localized tags', async () => {
    mocks.getSystemToolList.mockResolvedValueOnce([
      {
        id: 'systemTool-web-search',
        version: '1.2.3',
        etag: 'etag-1',
        status: 'Normal',
        source: 'system',
        isToolSet: false,
        avatar: 'search.svg',
        name: '联网搜索',
        intro: '搜索网页内容',
        author: 'FastGPT',
        tags: ['search'],
        currentCost: 0,
        systemKeyCost: 0,
        hasTokenFee: false,
        hasSystemSecret: false,
        systemSecretStatus: SystemToolSystemSecretStatusEnum.none
      }
    ]);

    const result = await handler(
      {
        query: {}
      } as ApiRequestProps<{}, {}>,
      {} as ApiResponseType<any>
    );

    expect(mocks.authSystemAdmin).toHaveBeenCalledTimes(1);
    expect(mocks.getSystemToolList).toHaveBeenCalledWith({
      sources: ['system'],
      lang: 'zh-CN'
    });
    expect(result).toEqual([
      {
        id: 'systemTool-web-search',
        version: '1.2.3',
        etag: 'etag-1',
        status: 'Normal',
        isToolSet: false,
        avatar: 'search.svg',
        name: '联网搜索',
        intro: '搜索网页内容',
        author: 'FastGPT',
        tags: ['搜索'],
        currentCost: 0,
        systemKeyCost: 0,
        hasTokenFee: false,
        systemSecretStatus: SystemToolSystemSecretStatusEnum.none
      }
    ]);
  });

  it('returns system key column status from repo list item', async () => {
    mocks.getSystemToolList.mockResolvedValueOnce([
      {
        id: 'systemTool-web-search',
        version: '1.2.3',
        etag: 'etag-1',
        status: 'Normal',
        source: 'system',
        isToolSet: false,
        avatar: 'search.svg',
        name: '联网搜索',
        intro: '搜索网页内容',
        author: 'FastGPT',
        tags: ['search'],
        currentCost: 0,
        systemKeyCost: 0,
        hasTokenFee: false,
        hasSystemSecret: true,
        systemSecretStatus: SystemToolSystemSecretStatusEnum.configured
      }
    ]);

    const result = await handler(
      {
        query: {}
      } as ApiRequestProps<{}, {}>,
      {} as ApiResponseType<any>
    );

    expect(result[0]).toMatchObject({
      systemSecretStatus: SystemToolSystemSecretStatusEnum.configured
    });
  });
});
