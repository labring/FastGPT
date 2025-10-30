import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { pluginClient } from '@fastgpt/service/thirdProvider/fastgptPlugin';

export type InstallToolBody = {
  downloadUrls: string[];
};

export type InstallToolResponse = {};

async function handler(
  req: ApiRequestProps<InstallToolBody, {}>,
  res: ApiResponseType<InstallToolResponse>
): Promise<InstallToolResponse> {
  await authCert({ req, authToken: true });

  const { downloadUrls } = req.body;

  if (!downloadUrls) {
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
