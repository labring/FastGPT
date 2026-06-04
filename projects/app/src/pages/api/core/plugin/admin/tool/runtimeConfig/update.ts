import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import type { UpdateToolRuntimeConfigBodyType } from '@fastgpt/global/openapi/core/plugin/admin/tool/api';
import { pluginClient } from '@fastgpt/service/thirdProvider/fastgptPlugin';
import { getToolRawId } from '@fastgpt/global/core/app/tool/utils';

export type updateToolRuntimeConfigQuery = {};

export type updateToolRuntimeConfigBody = UpdateToolRuntimeConfigBodyType;

export type updateToolRuntimeConfigResponse = {};

async function handler(
  req: ApiRequestProps<updateToolRuntimeConfigBody, updateToolRuntimeConfigQuery>,
  res: ApiResponseType<any>
): Promise<updateToolRuntimeConfigResponse> {
  await authSystemAdmin({ req });

  const { pluginId, runtimeConfig } = req.body;

  await pluginClient.setPluginRuntimeConfig(getToolRawId(pluginId), runtimeConfig);

  return {};
}

export default NextAPI(handler);
