import { afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ deletePlugin: vi.fn() }));
vi.mock('../../../thirdProvider/fastgptPlugin/index', () => ({
  PLUGIN_BASE_URL: 'http://plugin.test',
  PLUGIN_TOKEN: undefined,
  pluginClient: { deletePlugin: mocks.deletePlugin }
}));
import {
  disableSystemPlugin,
  restoreSystemPlugin
} from '../../../thirdProvider/fastgptPlugin/lifecycle';

describe('system plugin lifecycle', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });
  it('disables only the system installation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: [{ pluginId: 'keyword', version: '1', etag: 'abc', installationStatus: 'active' }]
          })
        )
      )
    );
    await disableSystemPlugin('keyword');
    expect(mocks.deletePlugin).toHaveBeenCalledWith({
      pluginId: 'keyword',
      source: 'system',
      scope: 'allVersions'
    });
  });
  it('does not disable an already disabled installation again', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ data: [{ pluginId: 'keyword', installationStatus: 'disabled' }] })
          )
        )
    );
    await disableSystemPlugin('keyword');
    expect(mocks.deletePlugin).not.toHaveBeenCalled();
  });
  it('restores retained identity without uploading files', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              { pluginId: 'keyword', version: '1', etag: 'abc', installationStatus: 'disabled' }
            ]
          })
        )
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetch);
    await restoreSystemPlugin('keyword');
    expect(fetch).toHaveBeenLastCalledWith(
      'http://plugin.test/api/plugin/restore',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ pluginId: 'keyword', source: 'system', version: '1', etag: 'abc' })
      })
    );
  });
  it('requires reinstallation after pruning', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [] }))));
    await expect(restoreSystemPlugin('keyword')).rejects.toThrow('插件文件已清理');
  });
  it('propagates remote failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ error: { message: 'remote failed' } }), { status: 500 })
        )
    );
    await expect(disableSystemPlugin('keyword')).rejects.toThrow('remote failed');
  });
});
