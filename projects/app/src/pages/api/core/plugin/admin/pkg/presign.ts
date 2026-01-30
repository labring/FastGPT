import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { pluginClient } from '@fastgpt/service/thirdProvider/fastgptPlugin';
import type {
  GetPkgPluginUploadURLQueryType,
  GetPkgPluginUploadURLResponseType
} from '@fastgpt/global/openapi/core/plugin/admin/api';

export type GetUploadURLQuery = GetPkgPluginUploadURLQueryType;

export type GetUploadURLResponse = GetPkgPluginUploadURLResponseType;

async function handler(
  req: ApiRequestProps<{}, GetUploadURLQuery>,
  res: ApiResponseType<GetUploadURLResponse>
): Promise<GetUploadURLResponse> {
  await authSystemAdmin({ req });

  const { filename } = req.query;

  if (!filename) {
    return Promise.reject('Filename is required');
  }

  return await pluginClient.getToolUploadUrl(filename);
}

export default NextAPI(handler);
