import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { pluginClient } from '@fastgpt/service/thirdProvider/fastgptPlugin';
import { MongoTeamInstalledPlugin } from '@fastgpt/service/core/plugin/schema/teamInstalledPluginSchema';
import { AppToolSourceEnum } from '@fastgpt/global/core/app/tool/constants';
import { MongoSystemTool } from '@fastgpt/service/core/plugin/tool/systemToolSchema';
import type { DeletePkgPluginQueryType } from '@fastgpt/global/openapi/core/plugin/admin/api';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { refreshVersionKey } from '@fastgpt/service/common/cache';
import { SystemCacheKeyEnum } from '@fastgpt/service/common/cache/type';

export type GetUploadURLQuery = DeletePkgPluginQueryType;

export type GetUploadURLResponse = {};

async function handler(
  req: ApiRequestProps<{}, GetUploadURLQuery>,
  res: ApiResponseType<GetUploadURLResponse>
): Promise<GetUploadURLResponse> {
  await authSystemAdmin({ req });

  const { toolId } = req.query;

  const result = await pluginClient.tool.upload.delete({
    query: {
      toolId
    }
  });

  if (result.status !== 200) {
    return Promise.reject(result.body);
  }

  const pluginId = `${AppToolSourceEnum.systemTool}-${toolId}`;

  await mongoSessionRun(async (session) => {
    await MongoTeamInstalledPlugin.deleteMany({ pluginId }, { session });

    await MongoSystemTool.deleteMany({ pluginId }, { session });
  });

  await refreshVersionKey(SystemCacheKeyEnum.systemTool);

  return result.body;
}

export default NextAPI(handler);
