import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { getLocale } from '@fastgpt/service/common/middle/i18n';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  GetModerationPluginListQuerySchema,
  GetModerationPluginListResponseSchema,
  type GetModerationPluginListQueryType,
  type GetModerationPluginListResponseType
} from '@fastgpt/global/openapi/core/plugin/admin/moderation/api';
import { getAdminModerationPluginList } from '@fastgpt/service/core/plugin/moderation/service';

export type AdminModerationListQuery = GetModerationPluginListQueryType;
export type AdminModerationListBody = Record<string, never>;
export type AdminModerationListResponse = GetModerationPluginListResponseType;

/**
 * 获取内容审查插件管理列表。
 *
 * 需要系统管理员（root）权限：审查插件会影响全站内容能否放行，不属于团队级配置。
 */
export async function handler(
  req: ApiRequestProps<AdminModerationListBody, AdminModerationListQuery>,
  _res: ApiResponseType<any>
): Promise<AdminModerationListResponse> {
  await authSystemAdmin({ req });
  const { query } = parseApiInput({ req, querySchema: GetModerationPluginListQuerySchema });

  const result = await getAdminModerationPluginList({
    lang: getLocale(req),
    includeDeleted: query.includeDeleted
  });

  return GetModerationPluginListResponseSchema.parse(result);
}

export default NextAPI(handler);
