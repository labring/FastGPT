import { describe, expect, it } from 'vitest';
import { PluginStatusEnum } from '@fastgpt/global/core/plugin/type';
import {
  comparePluginVersion,
  getBatchUpdateFailures,
  getInstallErrorReason,
  getInstallFailureMessage,
  getMarketplaceToolStateAfterInstall,
  hasMarketplaceToolUpdate,
  parseTeamInstallFailure,
  shouldReinstallOfflineMarketplaceTool,
  summarizeBatchUpdateResult,
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

describe('comparePluginVersion', () => {
  it('compares semver versions including prereleases and v-prefixes', () => {
    expect(comparePluginVersion('1.2.0', '1.1.9')).toBeGreaterThan(0);
    expect(comparePluginVersion('v1.0.10', '1.0.2')).toBeGreaterThan(0);
    expect(comparePluginVersion('1.0.0', '1.0.0-beta.1')).toBeGreaterThan(0);
    expect(comparePluginVersion('1.0.0-beta.2', '1.0.0-beta.10')).toBeLessThan(0);
    expect(comparePluginVersion('1.0.0', '1.0.0')).toBe(0);
    expect(comparePluginVersion('latest', '1.0.0')).toBeUndefined();
  });
});

describe('hasMarketplaceToolUpdate', () => {
  it('detects updates when marketplace semver is newer', () => {
    expect(
      hasMarketplaceToolUpdate({
        installedVersion: '1.0.0',
        installedEtag: 'etag-1',
        marketplaceVersion: '1.0.1',
        marketplaceEtag: 'etag-2'
      })
    ).toBe(true);
  });

  it('does not prompt downgrade when installed semver is newer than marketplace', () => {
    expect(
      hasMarketplaceToolUpdate({
        installedVersion: '1.1.0',
        installedEtag: 'etag-2',
        marketplaceVersion: '1.0.0',
        marketplaceEtag: 'etag-1'
      })
    ).toBe(false);
  });

  it('detects same-version package replacements when both etags exist and differ', () => {
    expect(
      hasMarketplaceToolUpdate({
        installedVersion: '1.0.0',
        installedEtag: 'etag-old',
        marketplaceVersion: '1.0.0',
        marketplaceEtag: 'etag-new'
      })
    ).toBe(true);
    expect(
      hasMarketplaceToolUpdate({
        installedVersion: '1.0.0',
        installedEtag: 'etag-same',
        marketplaceVersion: '1.0.0',
        marketplaceEtag: 'etag-same'
      })
    ).toBe(false);
  });

  it('requires non-empty installed etag to treat same-version packages as updatable', () => {
    expect(
      hasMarketplaceToolUpdate({
        installedVersion: '1.0.0',
        installedEtag: '',
        marketplaceVersion: '1.0.0',
        marketplaceEtag: 'etag-new'
      })
    ).toBe(false);
  });

  it('falls back to string inequality for non-semver versions', () => {
    expect(
      hasMarketplaceToolUpdate({
        installedVersion: '2026.01',
        marketplaceVersion: '2026.02'
      })
    ).toBe(true);
    expect(
      hasMarketplaceToolUpdate({
        installedVersion: '',
        marketplaceVersion: '1.0.0'
      })
    ).toBe(true);
  });
});

describe('marketplace install failure helpers', () => {
  it('parses team install failure arrays from plain strings, responseError objects, and structured data', () => {
    const failed = [{ url: 'url-1', reason: { en: 'Install failed', 'zh-CN': '安装失败' } }];

    expect(parseTeamInstallFailure(JSON.stringify(failed))).toEqual(failed);
    expect(
      parseTeamInstallFailure({
        code: 500,
        statusText: 'error',
        message: JSON.stringify(failed),
        data: null
      })
    ).toEqual(failed);
    expect(parseTeamInstallFailure({ data: { failed } })).toEqual(failed);
    expect(parseTeamInstallFailure({ code: 500, message: 'plain error' })).toBeUndefined();
    expect(parseTeamInstallFailure('[invalid json')).toBeUndefined();
  });

  it('formats deduplicated localized install failure messages and returns undefined when empty', () => {
    expect(
      getInstallFailureMessage({
        installResult: { failed: [] },
        language: 'zh-CN',
        fallback: 'Error'
      })
    ).toBeUndefined();

    expect(
      getInstallFailureMessage({
        installResult: {
          failed: [
            { url: 'url-1', reason: { en: 'Timeout', 'zh-CN': '下载超时' } },
            { url: 'url-2', reason: { en: 'Timeout', 'zh-CN': '下载超时' } },
            { url: 'url-3', reason: { en: 'Invalid pkg', 'zh-CN': '插件包无效' } }
          ]
        },
        language: 'zh-CN',
        fallback: 'Error'
      })
    ).toBe('下载超时; 插件包无效');

    expect(
      getInstallFailureMessage({
        installResult: {
          failed: [{ url: 'url-1', reason: { en: '   ' } }]
        },
        language: 'en',
        fallback: 'Error'
      })
    ).toBe('Error');
  });

  it('extracts readable install error reason from JSON failure payloads and plain errors', () => {
    expect(
      getInstallErrorReason({
        error: {
          code: 500,
          message: JSON.stringify([
            { url: 'url-1', reason: { en: 'Bad pkg', 'zh-CN': '包格式错误' } }
          ])
        },
        language: 'zh-CN',
        fallback: 'Error'
      })
    ).toBe('包格式错误');

    expect(
      getInstallErrorReason({
        error: { code: 500, message: 'Download failed: network error' },
        language: 'en',
        fallback: 'Error'
      })
    ).toBe('Download failed: network error');
  });

  it('summarizes batch update outcomes across full success, partial success, and full failure', () => {
    expect(summarizeBatchUpdateResult({ totalCount: 2, failures: [] })).toEqual({
      status: 'success',
      successCount: 2,
      failedCount: 0,
      firstReason: undefined
    });

    expect(
      summarizeBatchUpdateResult({
        totalCount: 2,
        failures: [{ toolId: 'tool-2', reason: '安装失败' }]
      })
    ).toEqual({
      status: 'partial',
      successCount: 1,
      failedCount: 1,
      firstReason: '安装失败'
    });

    expect(
      summarizeBatchUpdateResult({
        totalCount: 2,
        failures: [
          { toolId: 'tool-1', reason: '下载超时' },
          { toolId: 'tool-2', reason: '校验失败' }
        ]
      })
    ).toEqual({
      status: 'error',
      successCount: 0,
      failedCount: 2,
      firstReason: '下载超时'
    });
  });
});
