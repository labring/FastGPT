import type { NextApiResponse } from 'next';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import {
  AdminSwitchTeamBodySchema,
  AdminSwitchTeamResponseSchema,
  type AdminSwitchTeamBodyType,
  type AdminSwitchTeamResponseType
} from '@fastgpt/global/openapi/admin/team/api';
import { AdminAuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { getClientIpFromRequest } from '@fastgpt/service/common/security/clientIp';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { setCookie } from '@fastgpt/service/support/permission/auth/common';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { createUserSession, delUserSession } from '@fastgpt/service/support/user/session';
import { ensureRootTeamMember } from '@fastgpt/service/support/user/team/controller';

/**
 * 系统超级管理员（root）切换到指定目标团队。
 *
 * 切换过程按需在目标团队创建或恢复 root 专属成员锚点，签发保持 `isRoot: true` 的新会话并清理当前旧会话，
 * 同时写入 `ADMIN_SWITCH_TEAM` 审计日志留痕。
 */
async function handler(
  req: ApiRequestProps<AdminSwitchTeamBodyType>,
  res: NextApiResponse
): Promise<AdminSwitchTeamResponseType> {
  if (req.method !== 'PUT') {
    return Promise.reject(CommonErrEnum.invalidParams);
  }

  // 1. 严格校验系统超级管理员（root）身份与目标团队入参。
  const { body } = parseApiInput({
    req,
    bodySchema: AdminSwitchTeamBodySchema
  });
  const { userId, teamId: sourceTeamId, sessionId } = await authSystemAdmin({ req });

  // 2. 在目标团队中按需确保存在活跃的 root 成员锚点，跳过成员配额限制。
  const { team, tmb } = await ensureRootTeamMember({
    targetTeamId: body.teamId,
    rootUserId: userId
  });
  const targetTeamId = String(team._id);
  const targetTmbId = String(tmb._id);

  // 3. 更新最近登录团队成员偏好，并签发保持 isRoot=true 的新会话令牌与 Cookie。
  const ip = getClientIpFromRequest(req);
  const [, token] = await Promise.all([
    MongoUser.updateOne({ _id: userId }, { $set: { lastLoginTmbId: tmb._id } }),
    createUserSession({
      userId,
      teamId: targetTeamId,
      tmbId: targetTmbId,
      isRoot: true,
      ip
    })
  ]);
  setCookie(res, token);

  if (sessionId && sessionId !== token) {
    await delUserSession(sessionId);
  }

  // 4. 异步记录跨团队切换审计日志。
  void addAuditLog({
    tmbId: targetTmbId,
    teamId: targetTeamId,
    event: AdminAuditEventEnum.ADMIN_SWITCH_TEAM,
    params: {
      name: 'root',
      sourceTeamId,
      targetTeamId,
      targetTeamName: team.name,
      ip
    }
  });

  return AdminSwitchTeamResponseSchema.parse({
    token,
    teamId: targetTeamId,
    tmbId: targetTmbId
  });
}

export default NextAPI(handler);
