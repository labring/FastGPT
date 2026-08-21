import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import {
  ResetToolRuntimeConfigBodySchema,
  type ResetToolRuntimeConfigBodyType
} from '@fastgpt/global/openapi/core/plugin/admin/tool/api';
import { pluginClient } from '@fastgpt/service/thirdProvider/fastgptPlugin';
import { getToolRawId } from '@fastgpt/global/core/app/tool/utils';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

export type resetToolRuntimeConfigQuery = Record<string, never>;

export type resetToolRuntimeConfigBody = ResetToolRuntimeConfigBodyType;

export type resetToolRuntimeConfigResponse = Record<string, never>;

async function handler(
  req: ApiRequestProps<resetToolRuntimeConfigBody, resetToolRuntimeConfigQuery>,
  _res: ApiResponseType<any>
): Promise<resetToolRuntimeConfigResponse> {
  await authSystemAdmin({ req });

  const { pluginId } = parseApiInput({ req, bodySchema: ResetToolRuntimeConfigBodySchema }).body;

  await pluginClient.resetPluginRuntimeConfig(getToolRawId(pluginId));

  return {};
}

export default NextAPI(handler);
