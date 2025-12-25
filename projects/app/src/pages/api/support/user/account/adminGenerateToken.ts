import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { authUserExist } from '@fastgpt/service/support/user/controller';
import { createUserSession } from '@fastgpt/service/support/user/session';
import { getUserDefaultTeam, getTmbInfoByTmbId } from '@fastgpt/service/support/user/team/controller';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';
import requestIp from 'request-ip';
import { UserStatusEnum } from '@fastgpt/global/support/user/constant';
import { NextAPI } from '@/service/middleware/entry';
import { Types } from '@fastgpt/service/common/mongo';
import type { PostAdminGenerateTokenProps, AdminGenerateTokenResponse } from '@fastgpt/global/support/user/api.d';

/**
 * 管理员接口：为指定用户生成登录 Token
 *
 * 功能说明：
 * - 只能使用 Root Key 访问（最高权限）
 * - 支持单团队模式和多团队模式
 * - 可以为用户指定团队生成 Token，或使用默认团队
 * - Token 有效期 7 天
 * - 可用于代理用户操作或第三方集成
 *
 * 使用方式：
 *
 * 方式1 - 使用默认团队：
 * POST /api/support/user/account/adminGenerateToken
 * Headers: { rootkey: "your_root_key_from_env" }
 * Body: { username: "target_username" }
 *
 * 方式2 - 指定团队ID：
 * POST /api/support/user/account/adminGenerateToken
 * Headers: { rootkey: "your_root_key_from_env" }
 * Body: { username: "target_username", teamId: "specific_team_id" }
 *
 * 方式3 - 指定 tmbId（团队成员ID）：
 * POST /api/support/user/account/adminGenerateToken
 * Headers: { rootkey: "your_root_key_from_env" }
 * Body: { tmbId: "team_member_id" }
 *
 * 响应：
 * {
 *   code: 200,
 *   data: {
 *     token: "userId:randomString",
 *     userId: "xxx",
 *     username: "xxx",
 *     teamId: "xxx",
 *     tmbId: "xxx",
 *     teamName: "xxx",
 *     role: "owner",
 *     permission: { hasAppCreatePer: true, ... }
 *   }
 * }
 */
async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    // 1. 验证 Root Key 权限（只有管理员可以调用）
    await authCert({ req, authRoot: true });

    // 2. 获取请求参数
    const { username, teamId, tmbId } = req.body as PostAdminGenerateTokenProps;

    let userTeamInfo;

    // 3. 根据不同参数获取用户团队信息
    if (tmbId) {
      // 方式3: 直接通过 tmbId 获取
      userTeamInfo = await getTmbInfoByTmbId({ tmbId });
    } else if (username) {
      // 查找用户是否存在
      const user = await authUserExist({ username });
      if (!user) {
        return jsonRes(res, {
          code: 404,
          error: `User '${username}' not found`
        });
      }

      // 检查用户状态
      if (user.status === UserStatusEnum.forbidden) {
        return jsonRes(res, {
          code: 403,
          error: `User '${username}' is forbidden`
        });
      }

      if (teamId) {
        // 方式2: 通过 username + teamId 获取指定团队
        const teamMember = await MongoTeamMember.findOne({
          userId: new Types.ObjectId(String(user._id)),
          teamId: new Types.ObjectId(teamId),
          status: TeamMemberStatusEnum.active
        });

        if (!teamMember) {
          return jsonRes(res, {
            code: 404,
            error: `User '${username}' is not a member of team '${teamId}' or has left the team`
          });
        }

        userTeamInfo = await getTmbInfoByTmbId({ tmbId: String(teamMember._id) });
      } else {
        // 方式1: 使用用户的默认团队
        userTeamInfo = await getUserDefaultTeam({ userId: String(user._id) });
      }
    } else {
      return jsonRes(res, {
        code: 400,
        error: 'Either username or tmbId is required'
      });
    }

    // 4. 获取用户真实的 username (用于判断是否为 root)
    let realUsername = username;
    if (!realUsername) {
      // 当使用 tmbId 时,需要通过 userId 查询 username
      const user = await authUserExist({ userId: userTeamInfo.userId });
      if (user) {
        realUsername = user.username;
      }
    }

    // 5. 创建 Session Token
    const token = await createUserSession({
      userId: userTeamInfo.userId,
      teamId: userTeamInfo.teamId,
      tmbId: userTeamInfo.tmbId,
      isRoot: realUsername === 'root',
      ip: requestIp.getClientIp(req)
    });

    // 6. 返回 Token 和完整的用户团队信息
    return jsonRes<AdminGenerateTokenResponse>(res, {
      data: {
        token,
        userId: userTeamInfo.userId,
        username: realUsername || '',
        teamId: userTeamInfo.teamId,
        tmbId: userTeamInfo.tmbId,
        teamName: userTeamInfo.teamName,
        teamAvatar: userTeamInfo.teamAvatar,
        memberName: userTeamInfo.memberName,
        avatar: userTeamInfo.avatar,
        role: userTeamInfo.role,
        status: userTeamInfo.status,
        permission: {
          hasManagePer: userTeamInfo.permission.hasManagePer,
          hasWritePer: userTeamInfo.permission.hasWritePer,
          isOwner: userTeamInfo.permission.isOwner,
          hasAppCreatePer: userTeamInfo.permission.hasAppCreatePer,
          hasDatasetCreatePer: userTeamInfo.permission.hasDatasetCreatePer,
          hasApikeyCreatePer: userTeamInfo.permission.hasApikeyCreatePer
        },
        balance: userTeamInfo.balance
      }
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}

export default NextAPI(handler);
