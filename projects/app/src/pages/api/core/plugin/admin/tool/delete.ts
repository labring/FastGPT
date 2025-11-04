import { NextAPI } from '@/service/middleware/entry';
import { MongoSystemTool } from '@fastgpt/service/core/plugin/tool/systemToolSchema';
import { MongoTeamInstalledPlugin } from '@fastgpt/service/core/plugin/schema/teamInstalledPluginSchema';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { refreshVersionKey } from '@fastgpt/service/common/cache';
import { SystemCacheKeyEnum } from '@fastgpt/service/common/cache/type';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import type { DeleteSystemToolQueryType } from '@fastgpt/global/openapi/core/plugin/admin/tool/api';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';

export type deletePluginQuery = DeleteSystemToolQueryType;

export type deletePluginBody = {};

export type deletePluginResponse = {};

async function handler(
  req: ApiRequestProps<deletePluginBody, deletePluginQuery>,
  res: ApiResponseType<any>
): Promise<deletePluginResponse> {
  await authSystemAdmin({ req });

  const toolId = req.query.toolId;

  await mongoSessionRun(async (session) => {
    await MongoSystemTool.deleteOne({ pluginId: toolId }, { session });
    await MongoTeamInstalledPlugin.deleteMany({ pluginId: toolId }, { session });
  });

  await refreshVersionKey(SystemCacheKeyEnum.systemTool);

  return {};
}

export default NextAPI(handler);
