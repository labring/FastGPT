import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { getLocale } from '@fastgpt/service/common/middle/i18n';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  DeleteModerationPluginBodySchema,
  type DeleteModerationPluginBodyType
} from '@fastgpt/global/openapi/core/plugin/admin/moderation/api';
import { deleteModerationPlugin } from '@fastgpt/service/core/plugin/moderation/service';
import {
  captureModerationUninstallAuditSnapshot,
  recordModerationUninstallAudit
} from '@fastgpt/service/core/plugin/moderation/audit';

export type AdminModerationDeleteQuery = Record<string, never>;
export type AdminModerationDeleteBody = DeleteModerationPluginBodyType;

/**
 * 软卸载内容审查插件，保留本地配置供恢复。
 *
 * 已启用的插件需先停用，否则会出现「配置指向已删除插件」的悬空状态。
 */
export async function handler(
  req: ApiRequestProps<AdminModerationDeleteBody, AdminModerationDeleteQuery>,
  _res: ApiResponseType<any>
): Promise<void> {
  const authResult = await authSystemAdmin({ req });

  const { pluginId, source } = parseApiInput({
    req,
    bodySchema: DeleteModerationPluginBodySchema
  }).body;

  const lang = req.headers ? getLocale(req) : undefined;
  const auditSnapshot = await captureModerationUninstallAuditSnapshot({
    operator: authResult,
    pluginId,
    source,
    lang
  });
  await deleteModerationPlugin({ pluginId, source });
  await recordModerationUninstallAudit({
    operator: authResult,
    pluginId,
    snapshot: auditSnapshot
  });
}

export default NextAPI(handler);
