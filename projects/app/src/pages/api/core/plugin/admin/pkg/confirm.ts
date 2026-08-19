import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { pluginClient } from '@fastgpt/service/thirdProvider/fastgptPlugin';
import {
  ConfirmUploadPkgPluginBodySchema,
  type ConfirmUploadPkgPluginBodyType
} from '@fastgpt/global/openapi/core/plugin/admin/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

async function handler(req: ApiRequestProps<ConfirmUploadPkgPluginBodyType>): Promise<void> {
  await authSystemAdmin({ req });

  const { body } = parseApiInput({
    req,
    bodySchema: ConfirmUploadPkgPluginBodySchema
  });
  const { toolIds } = body;

  await pluginClient.confirmPlugin(
    toolIds.map((id) => ({
      ...id,
      pluginId: id.pluginId.replace(/^systemTool-/, '')
    }))
  );
}

export default NextAPI(handler);
