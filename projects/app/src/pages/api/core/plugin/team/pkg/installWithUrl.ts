import { NextAPI } from '@/service/middleware/entry';
import {
  InstallTeamPluginFromUrlBodySchema,
  InstallTeamPluginFromUrlResponseSchema,
  TeamPkgEmptyResponseSchema,
  type InstallTeamPluginFromUrlBodyType,
  type InstallTeamPluginFromUrlResponseType
} from '@fastgpt/global/openapi/core/plugin/team/pkg/api';
import { TeamPluginInstallSourceEnum } from '@fastgpt/global/core/plugin/schema/type';
import { getTeamPluginSource } from '@fastgpt/global/core/app/tool/utils';
import { TeamManagePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { createPluginInstallFailureError } from '@fastgpt/service/core/plugin/installResult';
import { getLocale } from '@fastgpt/service/common/middle/i18n';
import {
  assertTeamPluginInstallEnabled,
  assertTeamPluginSourceReady,
  getRawPluginIdFromSystemToolId,
  upsertTeamInstalledPluginPolicy
} from '@fastgpt/service/core/plugin/teamPluginPolicy';
import { pluginClient } from '@fastgpt/service/thirdProvider/fastgptPlugin';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import type { ApiRequestProps } from '@fastgpt/next/type';
import crypto from 'node:crypto';

export type InstallTeamPluginFromUrlBody = InstallTeamPluginFromUrlBodyType;
export type InstallTeamPluginFromUrlResponse = InstallTeamPluginFromUrlResponseType;

const getDownloadUrlHash = (url?: string) =>
  url ? crypto.createHash('sha256').update(url).digest('hex') : undefined;

async function handler(
  req: ApiRequestProps<InstallTeamPluginFromUrlBody>
): Promise<InstallTeamPluginFromUrlResponse> {
  assertTeamPluginInstallEnabled();

  const {
    body: { downloadUrls, plugins }
  } = parseApiInput({
    req,
    bodySchema: InstallTeamPluginFromUrlBodySchema
  });

  const { teamId, tmbId } = await authUserPer({
    req,
    authToken: true,
    per: TeamManagePermissionVal
  });

  const installResult = await pluginClient.installPlugins(downloadUrls, {
    source: getTeamPluginSource(teamId)
  });
  const failed = installResult.failed ?? [];
  const failedUrlCount = failed.reduce((map, item) => {
    map.set(item.url, (map.get(item.url) ?? 0) + 1);
    return map;
  }, new Map<string, number>());
  const installedPluginEntries = plugins.flatMap((plugin, index) => {
    const downloadUrl = downloadUrls[index];
    const failedCount = failedUrlCount.get(downloadUrl) ?? 0;
    if (failedCount === 0) return [{ plugin, downloadUrl }];

    failedUrlCount.set(downloadUrl, failedCount - 1);
    return [];
  });

  await Promise.all(
    installedPluginEntries.map(async ({ plugin, downloadUrl }) => {
      await assertTeamPluginSourceReady({
        teamId,
        tools: [plugin]
      });

      return upsertTeamInstalledPluginPolicy({
        teamId,
        tmbId,
        pluginId: getRawPluginIdFromSystemToolId(plugin.pluginId),
        version: plugin.version,
        etag: plugin.etag,
        installSource: TeamPluginInstallSourceEnum.marketplace,
        confirmedPermissions: plugin.permission,
        packageSource: {
          marketplaceToolId: plugin.marketplaceToolId ?? plugin.pluginId,
          marketplaceSource: plugin.marketplaceSource,
          downloadUrlHash: getDownloadUrlHash(downloadUrl)
        }
      });
    })
  );

  if (failed.length > 0) {
    // 全量失败时返回可读的 HTTP 500 业务异常；部分成功则与 admin 接口对齐，返回 200 + failed 供前端展示明细。
    if (installedPluginEntries.length === 0) {
      const lang = req.headers ? getLocale(req) : undefined;
      throw createPluginInstallFailureError({ failed, lang });
    }
    return InstallTeamPluginFromUrlResponseSchema.parse({ failed });
  }

  return TeamPkgEmptyResponseSchema.parse(undefined);
}

export default NextAPI(handler);
