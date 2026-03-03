import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { pluginClient } from '@fastgpt/service/thirdProvider/fastgptPlugin';
import type {
  ParseUploadedPkgPluginQueryType,
  ParseUploadedPkgPluginResponseType
} from '@fastgpt/global/openapi/core/plugin/admin/api';

export type ParseUploadedToolQuery = ParseUploadedPkgPluginQueryType;

export type ParseUploadedToolResponse = ParseUploadedPkgPluginResponseType;

async function handler(
  req: ApiRequestProps<{}, ParseUploadedToolQuery>,
  res: ApiResponseType<ParseUploadedToolResponse>
): Promise<ParseUploadedToolResponse> {
  await authSystemAdmin({ req });

  const { objectName } = req.query;

  if (!objectName) {
    return Promise.reject('Object name is required');
  }

  return await pluginClient.parseUploadedTool(objectName);
}

export default NextAPI(handler);
