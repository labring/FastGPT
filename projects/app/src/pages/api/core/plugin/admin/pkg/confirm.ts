import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { pluginClient } from '@fastgpt/service/thirdProvider/fastgptPlugin';
import type { ConfirmUploadPkgPluginBodyType } from '@fastgpt/global/openapi/core/plugin/admin/api';

export type ConfirmUploadBody = ConfirmUploadPkgPluginBodyType;

export type ConfirmUploadResponse = {};

async function handler(
  req: ApiRequestProps<ConfirmUploadBody, {}>,
  res: ApiResponseType<ConfirmUploadResponse>
): Promise<ConfirmUploadResponse> {
  await authSystemAdmin({ req });

  const { toolIds } = req.body;

  if (!toolIds || toolIds.length === 0) {
    return Promise.reject('Tool IDs are required');
  }

  await pluginClient.confirmPlugin(
    toolIds.map((id) => ({
      ...id,
      pluginId: id.pluginId.replace(/^systemTool-/, '')
    }))
  );
  return {};
}

export default NextAPI(handler);
