import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import type { ResetToolRuntimeConfigBodyType } from '@fastgpt/global/openapi/core/plugin/admin/tool/api';
import { pluginClient } from '@fastgpt/service/thirdProvider/fastgptPlugin';
import { getToolRawId } from '@fastgpt/global/core/app/tool/utils';

export type resetToolRuntimeConfigQuery = {};

export type resetToolRuntimeConfigBody = ResetToolRuntimeConfigBodyType;

export type resetToolRuntimeConfigResponse = {};

async function handler(
  req: ApiRequestProps<resetToolRuntimeConfigBody, resetToolRuntimeConfigQuery>,
  res: ApiResponseType<any>
): Promise<resetToolRuntimeConfigResponse> {
  await authSystemAdmin({ req });

  const { pluginId } = req.body;

  await pluginClient.resetPluginRuntimeConfig(getToolRawId(pluginId));

  return {};
}

export default NextAPI(handler);
