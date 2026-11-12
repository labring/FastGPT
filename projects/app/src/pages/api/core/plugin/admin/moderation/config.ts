import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { getLocale } from '@fastgpt/service/common/middle/i18n';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { AdminModerationPluginItemSchema } from '@fastgpt/global/core/plugin/moderation/type';
import {
  SaveModerationConfigBodySchema,
  type SaveModerationConfigBodyType,
  type SaveModerationConfigResponseType
} from '@fastgpt/global/openapi/core/plugin/admin/moderation/api';
import { saveModerationConfig } from '@fastgpt/service/core/plugin/moderation/service';

export type AdminModerationConfigQuery = Record<string, never>;
export type AdminModerationConfigBody = SaveModerationConfigBodyType;
export type AdminModerationConfigResponse = SaveModerationConfigResponseType;

/**
 * 保存内容审查插件配置（凭据 / 策略 ID / 启用状态）。
 *
 * 启用是全局互斥的：`enabled: true` 会在同一事务内停用其他审查插件。
 * 响应返回合并并脱敏后的最新视图，前端可直接用它刷新表格行。
 */
export async function handler(
  req: ApiRequestProps<AdminModerationConfigBody, AdminModerationConfigQuery>,
  _res: ApiResponseType<any>
): Promise<AdminModerationConfigResponse> {
  await authSystemAdmin({ req });

  const { pluginId, version, secretsVal, enabled } = parseApiInput({
    req,
    bodySchema: SaveModerationConfigBodySchema
  }).body;

  const result = await saveModerationConfig({
    pluginId,
    version,
    secretsVal,
    enabled,
    lang: getLocale(req)
  });

  return AdminModerationPluginItemSchema.parse(result);
}

export default NextAPI(handler);
