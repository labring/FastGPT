import { NextAPI } from '@/service/middleware/entry';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoSystemPlugin } from '@fastgpt/service/core/app/plugin/systemPluginSchema';
import { MongoTeamInstalledPlugin } from '@fastgpt/service/core/app/plugin/teamInstalledPluginSchema';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { refreshVersionKey } from '@fastgpt/service/common/cache';
import { SystemCacheKeyEnum } from '@fastgpt/service/common/cache/type';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';

export type deletePluginQuery = { id: string };

export type deletePluginBody = {};

export type deletePluginResponse = {};

async function handler(
  req: ApiRequestProps<deletePluginBody, deletePluginQuery>,
  res: ApiResponseType<any>
): Promise<deletePluginResponse> {
  await authSystemAdmin({ req });

  const pluginId = req.query.id;

  await MongoSystemPlugin.deleteOne({ pluginId });

  await MongoTeamInstalledPlugin.deleteMany({ pluginId });

  await refreshVersionKey(SystemCacheKeyEnum.systemTool);

  return {};
}

export default NextAPI(handler);
