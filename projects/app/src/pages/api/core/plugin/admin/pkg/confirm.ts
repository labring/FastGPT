import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { pluginClient } from '@fastgpt/service/thirdProvider/fastgptPlugin';
import {
  ConfirmUploadPkgPluginBodySchema,
  type ConfirmUploadPkgPluginBodyType
} from '@fastgpt/global/openapi/core/plugin/admin/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

export type ConfirmUploadBody = ConfirmUploadPkgPluginBodyType;

export type ConfirmUploadResponse = Record<string, never>;

async function handler(
  req: ApiRequestProps<ConfirmUploadBody, Record<string, never>>,
  _res: ApiResponseType<ConfirmUploadResponse>
): Promise<ConfirmUploadResponse> {
  await authSystemAdmin({ req });

  const { body } = parseApiInput({
    req,
    bodySchema: ConfirmUploadPkgPluginBodySchema
  });
  const { toolIds } = body;

  const confirmResult = await pluginClient.confirmPlugin(
    toolIds.map((id) => ({
      ...id,
      pluginId: id.pluginId.replace(/^systemTool-/, '')
    }))
  );

  if (confirmResult.failed.length > 0) {
    return Promise.reject(JSON.stringify(confirmResult.failed));
  }

  return {};
}

export default NextAPI(handler);
