import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import type {
  PluginInstallFailureType,
  PluginInstallResultType
} from '@fastgpt/global/sdk/fastgpt-plugin';

export type BatchUpdateFailure = {
  toolId: string;
  reason: string;
};

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
