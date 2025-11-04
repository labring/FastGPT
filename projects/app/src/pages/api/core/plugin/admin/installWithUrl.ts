import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { pluginClient } from '@fastgpt/service/thirdProvider/fastgptPlugin';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import type { InstallPluginFromUrlBodyType } from '@fastgpt/global/openapi/core/plugin/admin/api';

export type InstallToolBody = InstallPluginFromUrlBodyType;

export type InstallToolResponse = {};

async function handler(
  req: ApiRequestProps<InstallToolBody, {}>,
  res: ApiResponseType<InstallToolResponse>
): Promise<InstallToolResponse> {
  await authSystemAdmin({ req });

  const { downloadUrls } = req.body;

  if (!downloadUrls || downloadUrls.length === 0) {
    return Promise.reject('Download URL is required');
  }

  const result = await pluginClient.tool.upload.install({
    body: {
      urls: downloadUrls
    }
  });

  if (result.status !== 200) {
    return Promise.reject(result.body);
  }

  return result.body;
}

export default NextAPI(handler);
