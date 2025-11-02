import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { pluginClient } from '@fastgpt/service/thirdProvider/fastgptPlugin';
import { MongoTeamInstalledPlugin } from '@fastgpt/service/core/app/plugin/teamInstalledPluginSchema';
import { WorkflowToolSourceEnum } from '@fastgpt/global/core/app/tool/constants';
import type { DeletePkgPluginQueryType } from '@fastgpt/global/openapi/core/plugin/admin/api';

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

  const pluginId = `${WorkflowToolSourceEnum.systemTool}-${toolId}`;
  await MongoTeamInstalledPlugin.deleteMany({ pluginId });

  return result.body;
}

export default NextAPI(handler);
