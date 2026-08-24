import { describe, expect, it } from 'vitest';
import { PluginStatusEnum } from '@fastgpt/global/core/plugin/type';
import {
  getBatchUpdateFailures,
  getMarketplaceToolStateAfterInstall,
  shouldReinstallOfflineMarketplaceTool,
  updateMarketplaceInstalledPluginStatus
} from '@/web/core/plugin/marketplace/utils';
import { isToolVersionInstalled } from '@fastgpt/web/components/core/plugin/tool/utils';

const createInstalledPlugins = () => {
  const plugin = {
    id: 'weather',
    systemToolId: 'systemTool-weather',
    status: PluginStatusEnum.Normal,
    version: '1.0.0'
  };

  return {
    ids: new Set([plugin.id]),
    map: new Map([[plugin.id, plugin]]),
    allMap: new Map([[plugin.id, plugin]]),
    list: [plugin]
  };
};

describe('shouldReinstallOfflineMarketplaceTool', () => {
  it('re-enables an offline tool only when the selected version matches', () => {
    expect(
      shouldReinstallOfflineMarketplaceTool({
        isOffline: true,
        installedVersion: '3.0.0',
        targetVersion: '3.0.0'
      })
    ).toBe(true);
    expect(
      shouldReinstallOfflineMarketplaceTool({
        isOffline: true,
        installedVersion: '3.0.0',
        targetVersion: '2.0.0'
      })
    ).toBe(false);
  });
});

describe('getMarketplaceToolStateAfterInstall', () => {
  it('keeps the detail installed when refresh has not returned the newly installed tool yet', () => {
    expect(
      getMarketplaceToolStateAfterInstall({
        targetVersion: '3.0.0',
        refreshedInstalledVersion: undefined
      })
    ).toEqual({
      installed: true,
      installedVersion: '3.0.0',
      update: false
    });
  });
});

describe('isToolVersionInstalled', () => {
  it('recognizes every installed version returned by plugin-server', () => {
    expect(
      isToolVersionInstalled({
        isInstalled: true,
        currentVersion: '2.0.0',
        installedVersions: ['3.0.0', '2.0.0'],
        installedVersion: '3.0.0'
      })
    ).toBe(true);
  });

  it('uses the updated installed version while the installed version list is stale', () => {
    expect(
      isToolVersionInstalled({
        isInstalled: true,
        currentVersion: '3.0.0',
        installedVersions: ['2.0.0'],
        installedVersion: '3.0.0'
      })
    ).toBe(true);
  });

  it('treats all versions as unavailable while the tool is offline', () => {
    expect(
      isToolVersionInstalled({
        isInstalled: false,
        currentVersion: '2.0.0',
        installedVersions: ['3.0.0', '2.0.0']
      })
    ).toBe(false);
  });
});

describe('getBatchUpdateFailures', () => {
  it('maps partial failures from download URLs back to tool IDs', () => {
    expect(
      getBatchUpdateFailures({
        toolIds: ['tool-1', 'tool-2', 'tool-3'],
        downloadUrls: ['url-1', 'url-2', 'url-3'],
        installResult: {
          failed: [
            {
              url: 'url-2',
              reason: { en: 'Install failed', 'zh-CN': '安装失败' }
            }
          ]
        },
        language: 'zh-CN'
      })
    ).toEqual([{ toolId: 'tool-2', reason: '安装失败' }]);
  });

  it('returns an empty list when every plugin succeeds', () => {
    expect(
      getBatchUpdateFailures({
        toolIds: ['tool-1'],
        downloadUrls: ['url-1'],
        installResult: {},
        language: 'en'
      })
    ).toEqual([]);
  });

  it('falls back to the English reason for an unsupported locale', () => {
    expect(
      getBatchUpdateFailures({
        toolIds: ['tool-1'],
        downloadUrls: ['url-1'],
        installResult: {
          failed: [{ url: 'url-1', reason: { en: 'Install failed' } }]
        },
        language: 'ja'
      })
    ).toEqual([{ toolId: 'tool-1', reason: 'Install failed' }]);
  });

  it('ignores failure URLs that are not part of this request', () => {
    expect(
      getBatchUpdateFailures({
        toolIds: ['tool-1'],
        downloadUrls: ['url-1'],
        installResult: {
          failed: [{ url: 'other-url', reason: { en: 'Install failed' } }]
        },
        language: 'en'
      })
    ).toEqual([]);
  });
});

describe('marketplace installed plugin cache', () => {
  it('removes a soft-uninstalled plugin from active collections while retaining it in allMap', () => {
    const result = updateMarketplaceInstalledPluginStatus({
      data: createInstalledPlugins(),
      pluginId: 'weather',
      status: PluginStatusEnum.Offline
    });

    expect(result?.ids).toEqual(new Set());
    expect(result?.map).toEqual(new Map());
    expect(result?.list).toEqual([]);
    expect(result?.allMap.get('weather')?.status).toBe(PluginStatusEnum.Offline);
  });

  it('restores a soft-uninstalled plugin from the retained allMap entry', () => {
    const offline = updateMarketplaceInstalledPluginStatus({
      data: createInstalledPlugins(),
      pluginId: 'weather',
      status: PluginStatusEnum.Offline
    });
    const result = updateMarketplaceInstalledPluginStatus({
      data: offline,
      pluginId: 'weather',
      status: PluginStatusEnum.Normal
    });

    expect(result?.ids).toEqual(new Set(['weather']));
    expect(result?.map.get('weather')?.status).toBe(PluginStatusEnum.Normal);
    expect(result?.list).toHaveLength(1);
  });
});
