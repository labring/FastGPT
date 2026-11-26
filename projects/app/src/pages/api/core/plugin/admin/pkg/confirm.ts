import { restoreLocalPluginConfigs } from '@fastgpt/service/core/plugin/restoreLocalConfigs';
import { recordInstalledModerationPluginsAudit } from '@fastgpt/service/core/plugin/moderation/audit';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { getLocale } from '@fastgpt/service/common/middle/i18n';
import { pluginClient } from '@fastgpt/service/thirdProvider/fastgptPlugin';
import {
  ConfirmUploadPkgPluginBodySchema,
  type ConfirmUploadPkgPluginBodyType
} from '@fastgpt/global/openapi/core/plugin/admin/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

async function handler(req: ApiRequestProps<ConfirmUploadPkgPluginBodyType>): Promise<void> {
  const authResult = await authSystemAdmin({ req });

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

  // Restore only successfully confirmed packages, even when other packages failed.
  if (confirmResult.confirmed.length > 0) {
    const confirmedIds = confirmResult.confirmed.map((item) => item.pluginId);
    await restoreLocalPluginConfigs({
      pluginIds: confirmedIds
    });
    await recordInstalledModerationPluginsAudit({
      operator: authResult,
      pluginIds: confirmedIds,
      lang: req.headers ? getLocale(req) : undefined
    });
  }

  if (confirmResult.failed.length > 0) {
    return Promise.reject(JSON.stringify(confirmResult.failed));
  }
}

export default NextAPI(handler);
