import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { getLocale } from '@fastgpt/service/common/middle/i18n';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { SystemModerationPolicySchema } from '@fastgpt/global/core/plugin/moderation/type';
import type {
  GetModerationPolicyResponseType,
  UpdateModerationPolicyBodyType,
  UpdateModerationPolicyResponseType
} from '@fastgpt/global/openapi/core/plugin/admin/moderation/api';
import {
  getModerationPolicy,
  updateModerationPolicy
} from '@fastgpt/service/core/plugin/moderation/service';
import {
  captureModerationPolicyAuditSnapshot,
  recordModerationPolicyAudit
} from '@fastgpt/service/core/plugin/moderation/audit';

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
  const authResult = await authSystemAdmin({ req });

  if (req.method === 'GET') {
    const policy = await getModerationPolicy();
    return SystemModerationPolicySchema.parse(policy);
  }

  const { body } = parseApiInput({
    req,
    bodySchema: SystemModerationPolicySchema
  });

  const lang = req.headers ? getLocale(req) : undefined;
  const auditSnapshot = await captureModerationPolicyAuditSnapshot(authResult);
  const updated = await updateModerationPolicy(body);
  await recordModerationPolicyAudit({
    operator: authResult,
    snapshot: auditSnapshot,
    nextPolicy: updated,
    lang
  });

  return SystemModerationPolicySchema.parse(updated);
}

export default NextAPI(handler);
