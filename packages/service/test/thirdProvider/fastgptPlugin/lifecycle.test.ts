import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listPlugins: vi.fn(),
  listTools: vi.fn(),
  deletePlugin: vi.fn(),
  restorePlugin: vi.fn(),
  getTool: vi.fn(),
  getModeration: vi.fn()
}));

vi.mock('../../../thirdProvider/fastgptPlugin/index', () => ({
  PLUGIN_BASE_URL: 'http://plugin.test',
  PLUGIN_TOKEN: undefined,
  pluginClient: mocks
}));

import {
  disableSystemPlugin,
  getRetainedModerationDetail,
  getRetainedToolDetail,
  listRetainedPlugins,
  listRetainedTools,
  restoreSystemPlugin
} from '../../../thirdProvider/fastgptPlugin/lifecycle';

describe('system plugin lifecycle', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('disables only the system installation', async () => {
    mocks.listPlugins.mockResolvedValue([
      { pluginId: 'keyword', version: '1', etag: 'abc', installationStatus: 'active' }
    ]);
    await disableSystemPlugin('keyword');
    expect(mocks.listPlugins).toHaveBeenCalledWith({
      includeDisabled: true,
      sources: ['system']
    });
    expect(mocks.deletePlugin).toHaveBeenCalledWith({
      pluginId: 'keyword',
      source: 'system',
      scope: 'allVersions'
    });
  });

  it('does not disable an already disabled installation again', async () => {
    mocks.listPlugins.mockResolvedValue([{ pluginId: 'keyword', installationStatus: 'disabled' }]);
    await disableSystemPlugin('keyword');
    expect(mocks.deletePlugin).not.toHaveBeenCalled();
  });

  it('restores retained identity without uploading files', async () => {
    mocks.listPlugins.mockResolvedValue([
      { pluginId: 'keyword', version: '1', etag: 'abc', installationStatus: 'disabled' }
    ]);
    mocks.restorePlugin.mockResolvedValue(undefined);
    await restoreSystemPlugin('keyword');
    expect(mocks.restorePlugin).toHaveBeenCalledWith({
      pluginId: 'keyword',
      source: 'system',
      version: '1',
      etag: 'abc'
    });
  });

  it('requires reinstallation after pruning', async () => {
    mocks.listPlugins.mockResolvedValue([]);
    await expect(restoreSystemPlugin('keyword')).rejects.toThrow('插件文件已清理');
  });

  it('propagates remote failures', async () => {
    mocks.listPlugins.mockRejectedValue(new Error('remote failed'));
    await expect(disableSystemPlugin('keyword')).rejects.toThrow('remote failed');
  });

  it('delegates retained tool and moderation queries to pluginClient with includeDisabled', async () => {
    mocks.listTools.mockResolvedValue([]);
    mocks.getTool.mockResolvedValue({ pluginId: 'tool-1' });
    mocks.getModeration.mockResolvedValue({ pluginId: 'mod-1' });

    await listRetainedTools();
    await getRetainedToolDetail('tool-1', '1.0.0');
    await getRetainedModerationDetail('mod-1', 'system');

    expect(mocks.listTools).toHaveBeenCalledWith({
      includeDisabled: true,
      sources: ['system']
    });
    expect(mocks.getTool).toHaveBeenCalledWith({
      pluginId: 'tool-1',
      source: 'system',
      includeDisabled: true,
      version: '1.0.0'
    });
    expect(mocks.getModeration).toHaveBeenCalledWith({
      pluginId: 'mod-1',
      source: 'system',
      includeDisabled: true
    });
  });
});
