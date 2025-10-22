import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { MongoTeamInstalledPlugin } from '@fastgpt/service/core/app/plugin/teamInstalledPluginSchema';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';

export type ToggleInstallPluginBody = {
  pluginId: string;
  installed: boolean;
};

export type ToggleInstallPluginResponse = {
  success: boolean;
};

async function handler(
  req: ApiRequestProps<ToggleInstallPluginBody>,
  res: ApiResponseType<any>
): Promise<ToggleInstallPluginResponse> {
  const { pluginId, installed } = req.body;

  const { teamId } = await authUserPer({
    req,
    authToken: true,
    per: WritePermissionVal
  });

  await MongoTeamInstalledPlugin.findOneAndUpdate(
    { teamId, pluginId },
    {
      teamId,
      pluginId,
      installed,
      updateTime: new Date()
    },
    {
      upsert: true,
      new: true
    }
  );

  return { success: true };
}

export default NextAPI(handler);
