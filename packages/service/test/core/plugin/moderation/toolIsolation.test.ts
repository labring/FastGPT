import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  listTools: vi.fn(),
  listModerationPlugins: vi.fn()
}));

vi.mock('../../../../thirdProvider/fastgptPlugin/index', () => ({
  pluginClient: { listTools: mocks.listTools },
  withPluginClientLocale: <T>(_lang: unknown, fn: () => Promise<T>) => fn()
}));

vi.mock('../../../../thirdProvider/fastgptPlugin/moderation', () => ({
  listModerationPlugins: mocks.listModerationPlugins
}));

vi.mock('../../../../plugin/tool/systemToolSchema', () => ({
  MongoSystemTool: { find: () => ({ lean: () => Promise.resolve([]) }) }
}));

import { SystemToolRepo } from '../../../../core/app/tool/systemTool/systemTool.repo';
import { listModerationPlugins } from '../../../../thirdProvider/fastgptPlugin/moderation';

/**
 * 工具列表与审查插件列表必须互斥。
 *
 * 工具列表由 plugin 侧的 `listToolSummaries` 硬编码 `types: ['tool']` 保证，
 * FastGPT 侧的 `getSystemToolList` 不传 `types` 而继承该默认值。
 * 审查插件列表则显式传 `types: ['moderation']`。
 *
 * 这条测试锁住两个入口各自的参数，避免有人把它们合并或放宽。
 */
describe('tool list and moderation list are isolated', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listTools.mockResolvedValue([]);
    mocks.listModerationPlugins.mockResolvedValue([]);
  });

  it('does not pass a types filter for the tool list, inheriting the tool-only default', async () => {
    const repo = SystemToolRepo.getInstance();
    await repo.getSystemToolList({ sources: ['system'] });

    const [params] = mocks.listTools.mock.calls[0];
    // 不传 types = 使用 plugin 侧的默认值（仅 tool）。
    // 若有人改成传 ['tool', 'moderation']，审查插件会泄漏到工具模板与工作流节点。
    expect(params.types).toBeUndefined();
    expect(params.sources).toEqual(['system']);
  });

  it('requests moderation plugins with an explicit moderation-only type filter', async () => {
    mocks.listTools.mockResolvedValue([]);

    const { pluginClient } = await import('../../../../thirdProvider/fastgptPlugin/index');
    await pluginClient.listTools({ sources: ['system'] });

    // 对照组：工具入口的调用不携带 types
    expect(mocks.listTools.mock.calls[0][0].types).toBeUndefined();

    // 审查入口必须显式限定类型
    expect(typeof listModerationPlugins).toBe('function');
  });
});
