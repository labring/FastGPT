import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  saveModerationConfig,
  getAdminModerationPluginList
} from '../../../../core/plugin/moderation/service';
import * as remote from '../../../../thirdProvider/fastgptPlugin/moderation';
import { MongoSystemModerationPlugin } from '../../../../core/plugin/moderation/schema';

const detail = {
  pluginId: 'keyword-config-test',
  source: 'system',
  version: '1.0.0',
  type: 'moderation' as const,
  name: 'Keyword moderation',
  meta: { provider: 'keyword' },
  secretSchema: {
    type: 'object',
    properties: {
      customKeywords: { type: 'string' },
      enableDefaultDict: { type: 'boolean', default: true }
    }
  }
};

describe('moderation configuration save and reload', () => {
  afterEach(() => vi.restoreAllMocks());

  it('does not mark an untouched credential-free plugin as configured', async () => {
    vi.spyOn(remote, 'getModerationPluginDetail').mockResolvedValue(detail);
    vi.spyOn(remote, 'listModerationPlugins').mockResolvedValue([detail]);
    const list = await getAdminModerationPluginList();
    expect(list[0].hasConfiguredSecrets).toBe(false);
  });

  it('reads the same system configuration that was saved when legacy and explicit source records coexist', async () => {
    vi.spyOn(remote, 'getModerationPluginDetail').mockResolvedValue(detail);
    vi.spyOn(remote, 'listModerationPlugins').mockResolvedValue([detail]);
    await MongoSystemModerationPlugin.create([
      { pluginId: detail.pluginId, secretsVal: { enablePolitics: true } },
      { pluginId: detail.pluginId, source: 'system', enabled: false }
    ]);
    const saved = await saveModerationConfig({
      pluginId: detail.pluginId,
      secretsVal: { enableDefaultDict: true }
    });
    expect(saved.hasConfiguredSecrets).toBe(true);
    const list = await getAdminModerationPluginList();
    expect(list[0].hasConfiguredSecrets).toBe(true);
    expect(list[0].secretsVal).toEqual(saved.secretsVal);
  });

  it('preserves explicit false values after saving and reloading', async () => {
    vi.spyOn(remote, 'getModerationPluginDetail').mockResolvedValue(detail);
    vi.spyOn(remote, 'listModerationPlugins').mockResolvedValue([detail]);
    await saveModerationConfig({
      pluginId: detail.pluginId,
      secretsVal: { enableDefaultDict: false }
    });
    const list = await getAdminModerationPluginList();
    expect(list[0].hasConfiguredSecrets).toBe(true);
    expect(list[0].secretsVal?.enableDefaultDict).toBe(false);
  });

  it('remains configured after saving an empty optional configuration and reloading the list', async () => {
    vi.spyOn(remote, 'getModerationPluginDetail').mockResolvedValue(detail);
    vi.spyOn(remote, 'listModerationPlugins').mockResolvedValue([detail]);
    const saved = await saveModerationConfig({
      pluginId: detail.pluginId,
      secretsVal: { customKeywords: '' }
    });
    expect(saved.hasConfiguredSecrets).toBe(true);
    const list = await getAdminModerationPluginList();
    expect(list[0].hasConfiguredSecrets).toBe(true);
    expect(list[0].source).toBe('system');
  });
});
