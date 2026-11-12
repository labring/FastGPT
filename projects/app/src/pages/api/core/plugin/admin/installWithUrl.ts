import { restoreLocalPluginConfigs } from '@fastgpt/service/core/plugin/restoreLocalConfigs';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { pluginClient } from '@fastgpt/service/thirdProvider/fastgptPlugin';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
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
  await authSystemAdmin({ req });

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
  await restoreLocalPluginConfigs({ pluginIds: installed.map((item) => item.pluginId) });
  return result;
}

export default NextAPI(handler);
