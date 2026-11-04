import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  DeleteModerationPluginBodySchema,
  type DeleteModerationPluginBodyType
} from '@fastgpt/global/openapi/core/plugin/admin/moderation/api';
import { deleteModerationPlugin } from '@fastgpt/service/core/plugin/moderation/service';

export type AdminModerationDeleteQuery = Record<string, never>;
export type AdminModerationDeleteBody = DeleteModerationPluginBodyType;

/**
 * 软删除（卸载）内容审查插件的本地配置记录。
 *
 * 已启用的插件需先停用，否则会出现「配置指向已删除插件」的悬空状态。
 */
export async function handler(
  req: ApiRequestProps<AdminModerationDeleteBody, AdminModerationDeleteQuery>,
  _res: ApiResponseType<any>
): Promise<void> {
  const auth = await authSystemAdmin({ req });

  const { pluginId } = parseApiInput({
    req,
    bodySchema: DeleteModerationPluginBodySchema
  }).body;

  await deleteModerationPlugin({ pluginId, tmbId: auth.tmbId });
}

export default NextAPI(handler);
