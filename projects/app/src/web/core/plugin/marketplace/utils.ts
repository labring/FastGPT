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

type ParsedSemver = {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
};

const SEMVER_REGEX = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

const parseSemver = (version: string): ParsedSemver | undefined => {
  const match = SEMVER_REGEX.exec(version.trim());
  if (!match) return undefined;

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ? match[4].split('.') : []
  };
};

const comparePrereleaseIdentifiers = (a: string[], b: string[]): number => {
  if (a.length === 0 && b.length === 0) return 0;
  // 按 SemVer 规范，正式版优先级高于同主次补丁号的预发布版
  if (a.length === 0) return 1;
  if (b.length === 0) return -1;

  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) {
    const idA = a[i];
    const idB = b[i];
    if (idA === undefined) return -1;
    if (idB === undefined) return 1;
    if (idA === idB) continue;

    const isNumericA = /^\d+$/.test(idA);
    const isNumericB = /^\d+$/.test(idB);
    if (isNumericA && isNumericB) {
      return Number(idA) - Number(idB);
    }
    if (isNumericA !== isNumericB) {
      return isNumericA ? -1 : 1;
    }
    return idA < idB ? -1 : 1;
  }

  return 0;
};

/**
 * 比较两个插件语义化版本号；任一非标准 SemVer 时返回 `undefined`，由调用方回退到字符串对比。
 */
export const comparePluginVersion = (versionA: string, versionB: string): number | undefined => {
  const parsedA = parseSemver(versionA);
  const parsedB = parseSemver(versionB);
  if (!parsedA || !parsedB) return undefined;

  if (parsedA.major !== parsedB.major) return parsedA.major - parsedB.major;
  if (parsedA.minor !== parsedB.minor) return parsedA.minor - parsedB.minor;
  if (parsedA.patch !== parsedB.patch) return parsedA.patch - parsedB.patch;

  return comparePrereleaseIdentifiers(parsedA.prerelease, parsedB.prerelease);
};

/**
 * 判断市场插件相对已安装版本是否存在更新：
 * - 市场版本高于已安装版本时返回 true；
 * - 已安装版本高于市场版本时不提示降级更新；
 * - 同版本时通过双方非空 `etag` 识别同版本包内容替换。
 */
export const hasMarketplaceToolUpdate = ({
  installedVersion,
  installedEtag,
  marketplaceVersion,
  marketplaceEtag
}: {
  installedVersion?: string;
  installedEtag?: string;
  marketplaceVersion?: string;
  marketplaceEtag?: string;
}) => {
  const hasDifferentEtag = Boolean(
    marketplaceEtag && installedEtag && installedEtag !== marketplaceEtag
  );

  if (!marketplaceVersion) {
    return hasDifferentEtag;
  }
  if (!installedVersion) {
    return true;
  }

  const versionDiff = comparePluginVersion(marketplaceVersion, installedVersion);
  if (versionDiff !== undefined) {
    if (versionDiff > 0) return true;
    if (versionDiff < 0) return false;
    return hasDifferentEtag;
  }

  if (installedVersion !== marketplaceVersion) return true;
  return hasDifferentEtag;
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
