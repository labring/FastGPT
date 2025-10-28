import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { pluginClient } from '@fastgpt/service/thirdProvider/fastgptPlugin';

export type GetToolTagsResponse = Array<{
  type: string;
  name: {
    'zh-CN': string;
    en: string;
  };
}>;

async function handler(
  req: ApiRequestProps<{}, {}>,
  res: ApiResponseType<GetToolTagsResponse>
): Promise<GetToolTagsResponse> {
  await authCert({ req, authToken: true });

  const result = await pluginClient.tool.getType();

  if (result.status !== 200) {
    return Promise.reject(result.body);
  }

  return result.body;
}

export default NextAPI(handler);
