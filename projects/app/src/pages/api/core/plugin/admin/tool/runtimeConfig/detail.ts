import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import type {
  GetToolRuntimeConfigQueryType,
  GetToolRuntimeConfigResponseType
} from '@fastgpt/global/openapi/core/plugin/admin/tool/api';
import { GetToolRuntimeConfigResponseSchema } from '@fastgpt/global/openapi/core/plugin/admin/tool/api';
import { pluginClient } from '@fastgpt/service/thirdProvider/fastgptPlugin';
import { getToolRawId } from '@fastgpt/global/core/app/tool/utils';

export type getToolRuntimeConfigQuery = GetToolRuntimeConfigQueryType;

export type getToolRuntimeConfigBody = Record<string, never>;

export type getToolRuntimeConfigResponse = GetToolRuntimeConfigResponseType;

async function handler(
  req: ApiRequestProps<getToolRuntimeConfigBody, getToolRuntimeConfigQuery>,
  _res: ApiResponseType<any>
): Promise<getToolRuntimeConfigResponse> {
  await authSystemAdmin({ req });

  const { pluginId } = req.query;
  const runtimeConfig = await pluginClient.getPluginRuntimeConfig(getToolRawId(pluginId));

  return GetToolRuntimeConfigResponseSchema.parse({
    runtimeConfig: runtimeConfig ?? undefined
  });
}

export default NextAPI(handler);
