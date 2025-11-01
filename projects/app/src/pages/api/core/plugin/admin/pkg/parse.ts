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

  const result = await pluginClient.tool.upload.parseUploadedTool({
    query: {
      objectName
    }
  });

  if (result.status !== 200) {
    return Promise.reject(result.body);
  }

  return result.body;
}

export default NextAPI(handler);
