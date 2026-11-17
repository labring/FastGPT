import { restoreLocalPluginConfigs } from '@fastgpt/service/core/plugin/restoreLocalConfigs';
import { recordInstalledModerationPluginsAudit } from '@fastgpt/service/core/plugin/moderation/audit';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { pluginClient } from '@fastgpt/service/thirdProvider/fastgptPlugin';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { getLocale } from '@fastgpt/service/common/middle/i18n';
import {
  InstallPluginFromUrlBodySchema,
  type InstallPluginFromUrlBodyType
} from '@fastgpt/global/openapi/core/plugin/admin/api';
import type { PluginInstallResultType } from '@fastgpt/global/sdk/fastgpt-plugin';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

export type InstallToolBody = InstallPluginFromUrlBodyType;

export type InstallToolResponse = PluginInstallResultType;

async function handler(
  req: ApiRequestProps<InstallToolBody, Record<string, never>>,
  _res: ApiResponseType<InstallToolResponse>
): Promise<InstallToolResponse> {
  const authResult = await authSystemAdmin({ req });

  const { downloadUrls } = parseApiInput({
    req,
    bodySchema: InstallPluginFromUrlBodySchema
  }).body;

  if (!downloadUrls || downloadUrls.length === 0) {
    return Promise.reject('Download URL is required');
  }

  const result = await pluginClient.installPlugins(downloadUrls);
  // The new server returns exact successful package identities, including partial successes.
  const installed =
    (result as PluginInstallResultType & { installed?: Array<{ pluginId: string }> }).installed ??
    [];
  const installedIds = installed.map((item) => item.pluginId);
  await restoreLocalPluginConfigs({ pluginIds: installedIds });
  await recordInstalledModerationPluginsAudit({
    operator: authResult,
    pluginIds: installedIds,
    lang: req.headers ? getLocale(req) : undefined
  });
  return result;
}

export default NextAPI(handler);
