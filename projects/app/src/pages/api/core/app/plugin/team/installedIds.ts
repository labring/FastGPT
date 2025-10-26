import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoTeamInstalledPlugin } from '@fastgpt/service/core/app/plugin/teamInstalledPluginSchema';

export type GetInstalledIdsResponse = {
  installedIds: string[];
  uninstalledIds: string[];
};

async function handler(
  req: ApiRequestProps<{}>,
  res: ApiResponseType<any>
): Promise<GetInstalledIdsResponse> {
  const { teamId } = await authCert({ req, authToken: true });

  const records = await MongoTeamInstalledPlugin.find({ teamId }).lean();

  const installedIds: string[] = [];
  const uninstalledIds: string[] = [];

  records.forEach((record) => {
    if (record.installed) {
      installedIds.push(record.pluginId);
    } else {
      uninstalledIds.push(record.pluginId);
    }
  });

  return {
    installedIds,
    uninstalledIds
  };
}

export default NextAPI(handler);
