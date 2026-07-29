import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Call } from '@test/utils/request';
import { PluginStatusEnum } from '@fastgpt/global/core/plugin/type';

const mocks = vi.hoisted(() => ({
  authCert: vi.fn(),
  getLocale: vi.fn(),
  getUserDetail: vi.fn(),
  getSystemToolList: vi.fn(),
  getInstance: vi.fn(),
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

import handler from '@/pages/api/core/plugin/team/tool/list';

describe('team system plugin list handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authCert.mockResolvedValue({
      teamId: 'team-1',
      tmbId: 'tmb-1'
    });
    mocks.getLocale.mockReturnValue('zh');
    mocks.getUserDetail.mockResolvedValue({ tags: [] });
    mocks.getInstance.mockReturnValue({
      getSystemToolList: mocks.getSystemToolList
    });
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
        toolDescription: '',
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
      sources: ['system', 'team-1', 'debug:tmbId:tmb-1'],
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
      sources: ['system', 'team-1'],
      lang: 'zh'
    });
  });

  it('does not return uninstalled tools', async () => {
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
        toolDescription: '',
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
        toolDescription: '',
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
});
