import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  UpdateModerationPolicyBodySchema,
  type GetModerationPolicyResponseType,
  type UpdateModerationPolicyBodyType,
  type UpdateModerationPolicyResponseType
} from '@fastgpt/global/openapi/core/plugin/admin/moderation/api';
import {
  getModerationPolicy,
  updateModerationPolicy
} from '@fastgpt/service/core/plugin/moderation/service';

export type AdminModerationPolicyQuery = Record<string, never>;
export type AdminModerationPolicyBody = UpdateModerationPolicyBodyType;
export type AdminModerationPolicyResponse =
  | GetModerationPolicyResponseType
  | UpdateModerationPolicyResponseType;

/**
 * 获取与更新全局内容审核策略配置。
 *
 * GET: 返回当前全局策略（生效环节、处理策略、开启状态与生效插件）。
 * POST: 保存全局策略，并在开启时保证生效插件状态同步。需要系统管理员权限。
 */
export async function handler(
  req: ApiRequestProps<AdminModerationPolicyBody, AdminModerationPolicyQuery>,
  _res: ApiResponseType<any>
): Promise<AdminModerationPolicyResponse> {
  await authSystemAdmin({ req });

  if (req.method === 'GET') {
    return getModerationPolicy();
  }

  const { body } = parseApiInput({
    req,
    bodySchema: UpdateModerationPolicyBodySchema
  });

  return updateModerationPolicy(body);
}

export default NextAPI(handler);
