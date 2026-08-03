import { NextAPI } from '@/service/middleware/entry';
import {
  InstallTeamPluginFromUrlBodySchema,
  TeamPkgEmptyResponseSchema,
  type InstallTeamPluginFromUrlBodyType,
  type TeamPkgEmptyResponseType
} from '@fastgpt/global/openapi/core/plugin/team/pkg/api';
import { TeamPluginInstallSourceEnum } from '@fastgpt/global/core/plugin/schema/type';
import { getTeamPluginSource } from '@fastgpt/global/core/app/tool/utils';
import { TeamPluginManagePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  assertTeamPluginSourceReady,
  getRawPluginIdFromSystemToolId,
  upsertTeamInstalledPluginPolicy
} from '@fastgpt/service/core/plugin/teamPluginPolicy';
import { installPluginsToSource } from '@fastgpt/service/thirdProvider/fastgptPlugin';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import type { ApiRequestProps } from '@fastgpt/next/type';
import crypto from 'node:crypto';

export type InstallTeamPluginFromUrlBody = InstallTeamPluginFromUrlBodyType;
export type InstallTeamPluginFromUrlResponse = TeamPkgEmptyResponseType;

const getDownloadUrlHash = (url?: string) =>
  url ? crypto.createHash('sha256').update(url).digest('hex') : undefined;

async function handler(
  req: ApiRequestProps<InstallTeamPluginFromUrlBody>
): Promise<InstallTeamPluginFromUrlResponse> {
  const {
    body: { downloadUrls, plugins }
  } = parseApiInput({
    req,
    bodySchema: InstallTeamPluginFromUrlBodySchema
  });

  const { teamId, tmbId } = await authUserPer({
    req,
    authToken: true,
    per: TeamPluginManagePermissionVal
  });

  const installResult = await installPluginsToSource(downloadUrls, getTeamPluginSource(teamId));
  const failed = (installResult as any)?.failed;
  if (Array.isArray(failed) && failed.length > 0) {
    return Promise.reject(JSON.stringify(failed));
  }
  await assertTeamPluginSourceReady({
    teamId,
    tools: plugins
  });

  await Promise.all(
    plugins.map((plugin, index) =>
      upsertTeamInstalledPluginPolicy({
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
          downloadUrlHash: getDownloadUrlHash(downloadUrls[index])
        }
      })
    )
  );

  return TeamPkgEmptyResponseSchema.parse(undefined);
}

export default NextAPI(handler);
