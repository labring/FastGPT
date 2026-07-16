import { NextAPI } from '@/service/middleware/entry';
import type { ToggleInstallPluginBodyType } from '@fastgpt/global/openapi/core/plugin/team/api';

export type ToggleInstallPluginBody = ToggleInstallPluginBodyType;

export type ToggleInstallPluginResponse = Record<string, never>;

/** disable the toggle install plugin api */
async function handler(): Promise<ToggleInstallPluginResponse> {
  // const { pluginId, installed } = req.body;

  // const { teamId } = await authUserPer({
  //   req,
  //   authToken: true,
  //   per: ReadPermissionVal
  // });

  // await MongoTeamInstalledPlugin.findOneAndUpdate(
  //   { teamId, pluginId },
  //   {
  //     teamId,
  //     pluginId,
  //     installed
  //   },
  //   {
  //     upsert: true
  //   }
  // );

  return {};
}

export default NextAPI(handler);
