import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import { PluginStatusEnum, type PluginStatusType } from '@fastgpt/global/core/plugin/type';
import type {
  PluginInstallFailureType,
  PluginInstallResultType
} from '@fastgpt/global/sdk/fastgpt-plugin';

export type BatchUpdateFailure = {
  toolId: string;
  reason: string;
};

/** 根据安装后的刷新结果生成详情页安装状态。 */
export const getMarketplaceToolStateAfterInstall = ({
  targetVersion,
  refreshedInstalledVersion
}: {
  targetVersion?: string;
  refreshedInstalledVersion?: string;
}) => ({
  installed: true,
  installedVersion: targetVersion ?? refreshedInstalledVersion,
  update: false
});

/** 判断离线工具是否可以直接重新启用，版本不同时仍需下载安装所选版本。 */
export const shouldReinstallOfflineMarketplaceTool = ({
  isOffline,
  installedVersion,
  targetVersion
}: {
  isOffline: boolean;
  installedVersion?: string;
  targetVersion?: string;
}) => isOffline && installedVersion === targetVersion;

type MarketplaceInstalledPluginItem = {
  id: string;
  status: PluginStatusType;
};

export type MarketplaceInstalledPlugins<T extends MarketplaceInstalledPluginItem> = {
  ids: Set<string>;
  map: Map<string, T>;
  allMap: Map<string, T>;
  list: T[];
};

/** 更新管理员市场页的本地安装缓存，避免软卸载/恢复后重新请求 plugin 列表。 */
export const updateMarketplaceInstalledPluginStatus = <T extends MarketplaceInstalledPluginItem>({
  data,
  pluginId,
  status
}: {
  data?: MarketplaceInstalledPlugins<T>;
  pluginId: string;
  status: PluginStatusType;
}) => {
  if (!data) return data;

  const plugin = data.allMap.get(pluginId);
  if (!plugin) return data;

  const allMap = new Map(data.allMap);
  allMap.set(pluginId, { ...plugin, status });
  const list = Array.from(allMap.values()).filter(
    (item) => item.status !== PluginStatusEnum.Offline
  );

  return {
    ids: new Set(list.map((item) => item.id)),
    map: new Map(list.map((item) => [item.id, item])),
    allMap,
    list
  } satisfies MarketplaceInstalledPlugins<T>;
};

/**
 * 将 plugin-server 按下载地址返回的失败项映射回 marketplace toolId。
 * 下载地址与 toolId 按请求数组下标一一对应，未出现在 failed 中的项目视为更新成功。
 */
export const getBatchUpdateFailures = ({
  toolIds,
  downloadUrls,
  installResult,
  language
}: {
  toolIds: string[];
  downloadUrls: string[];
  installResult: PluginInstallResultType;
  language: string;
}): BatchUpdateFailure[] => {
  const failureByUrl = new Map<string, PluginInstallFailureType>(
    installResult.failed?.map((failure) => [failure.url, failure]) ?? []
  );

  return toolIds.flatMap((toolId, index) => {
    const failure = failureByUrl.get(downloadUrls[index]);
    if (!failure) return [];

    return [
      {
        toolId,
        reason: parseI18nString(failure.reason, language)
      }
    ];
  });
};
