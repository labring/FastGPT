import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { pluginClient } from '@fastgpt/service/thirdProvider/fastgptPlugin';
import { MongoTeamInstalledPlugin } from '@fastgpt/service/core/app/plugin/teamInstalledPluginSchema';
import { PluginSourceEnum } from '@fastgpt/global/core/app/plugin/constants';

export type GetUploadURLQuery = {
  toolId: string;
};

export type GetUploadURLResponse = {};

async function handler(
  req: ApiRequestProps<{}, GetUploadURLQuery>,
  res: ApiResponseType<GetUploadURLResponse>
): Promise<GetUploadURLResponse> {
  await authCert({ req, authToken: true });

  const { toolId } = req.query;

  const result = await pluginClient.tool.upload.delete({
    query: {
      toolId
    }
  });

  if (result.status !== 200) {
    return Promise.reject(result.body);
  }

  const pluginId = `${PluginSourceEnum.systemTool}-${toolId}`;
  await MongoTeamInstalledPlugin.deleteMany({ pluginId });

  return result.body;
}

export default NextAPI(handler);
