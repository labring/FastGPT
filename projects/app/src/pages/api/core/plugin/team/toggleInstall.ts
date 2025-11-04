import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { MongoTeamInstalledPlugin } from '@fastgpt/service/core/plugin/schema/teamInstalledPluginSchema';
import { ReadPermissionVal, WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import type { ToggleInstallPluginBodyType } from '@fastgpt/global/openapi/core/plugin/team/api';

export type ToggleInstallPluginBody = ToggleInstallPluginBodyType;

export type ToggleInstallPluginResponse = {};

async function handler(
  req: ApiRequestProps<ToggleInstallPluginBody>,
  res: ApiResponseType<any>
): Promise<ToggleInstallPluginResponse> {
  const { pluginId, installed } = req.body;

  const { teamId } = await authUserPer({
    req,
    authToken: true,
    per: ReadPermissionVal
  });

  await MongoTeamInstalledPlugin.findOneAndUpdate(
    { teamId, pluginId },
    {
      teamId,
      pluginId,
      installed
    },
    {
      upsert: true
    }
  );

  return {};
}

export default NextAPI(handler);
