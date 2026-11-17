import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  listPlugins: vi.fn()
}));

vi.mock('../../../../thirdProvider/fastgptPlugin/index', () => ({
  pluginClient: { listPlugins: mocks.listPlugins },
  withPluginClientLocale: <T>(_lang: unknown, fn: () => Promise<T>) => fn()
}));

import { listModerationPlugins } from '../../../../thirdProvider/fastgptPlugin/moderation';

describe('listModerationPlugins', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('asks the plugin service for moderation plugins only', async () => {
    mocks.listPlugins.mockResolvedValueOnce([]);

    await listModerationPlugins({ lang: 'zh-CN' });

    expect(mocks.listPlugins).toHaveBeenCalledWith({ types: ['moderation'] });
  });

  it('drops tool plugins if the service ever returns them', async () => {
    mocks.listPlugins.mockResolvedValueOnce([
      {
        pluginId: 'baidu-moderation',
        type: 'moderation',
        version: '1.0.0',
        source: 'system'
      },
      {
        pluginId: 'web-search',
        type: 'tool',
        version: '1.0.0',
        source: 'system'
      }
    ]);

    const result = await listModerationPlugins();

    // 审查插件混进工具列表（或反过来）都会让管理页展示错误内容，这里必须隔离
    expect(result.map((item) => item.pluginId)).toEqual(['baidu-moderation']);
  });

  it('passes through an empty result', async () => {
    mocks.listPlugins.mockResolvedValueOnce([]);
    await expect(listModerationPlugins()).resolves.toEqual([]);
  });
});
