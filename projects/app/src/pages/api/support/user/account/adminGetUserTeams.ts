import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { authUserExist } from '@fastgpt/service/support/user/controller';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';
import { NextAPI } from '@/service/middleware/entry';
import { Types } from '@fastgpt/service/common/mongo';
import type { TeamSchema } from '@fastgpt/global/support/user/team/type';
import type { AdminUserTeamsResponse } from '@fastgpt/global/support/user/api.d';

/**
 * 管理员接口：获取用户的所有团队列表
 *
 * 功能说明：
 * - 只能使用 Root Key 访问（最高权限）
 * - 查询指定用户加入的所有团队
 * - 返回团队ID、名称、成员状态等信息
 * - 用于多团队模式下选择目标团队
 *
 * 使用方式：
 * GET /api/support/user/account/adminGetUserTeams?username=target_username
 * Headers: { rootkey: "your_root_key_from_env" }
 *
 * 或者
 * POST /api/support/user/account/adminGetUserTeams
 * Headers: { rootkey: "your_root_key_from_env" }
 * Body: { username: "target_username", status: "active" }
 *
 * 响应：
 * {
 *   code: 200,
 *   data: {
 *     userId: "xxx",
 *     username: "xxx",
 *     teams: [
 *       {
 *         tmbId: "xxx",
 *         teamId: "xxx",
 *         teamName: "团队A",
 *         teamAvatar: "/icon/logo.svg",
 *         memberName: "张三",
 *         role: "owner",
 *         status: "active",
 *         createTime: "2024-01-01T00:00:00.000Z"
 *       },
 *       ...
 *     ],
 *     totalCount: 3
 *   }
 * }
 */
async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    // 1. 验证 Root Key 权限
    await authCert({ req, authRoot: true });

    // 2. 获取请求参数（支持 GET 和 POST）
    const username = req.method === 'GET' ? (req.query.username as string) : req.body?.username;
    const status =
      req.method === 'GET'
        ? (req.query.status as TeamMemberStatusEnum)
        : req.body?.status || TeamMemberStatusEnum.active;

    if (!username) {
      return jsonRes(res, {
        code: 400,
        error: 'Username is required'
      });
    }

    // 3. 查找用户是否存在
    const user = await authUserExist({ username });
    if (!user) {
      return jsonRes(res, {
        code: 404,
        error: `User '${username}' not found`
      });
    }

    // 4. 构建查询条件
    const query: any = {
      userId: new Types.ObjectId(String(user._id))
    };

    // 如果指定了状态，添加到查询条件
    if (status) {
      query.status = status;
    }

    // 5. 查询用户的所有团队成员记录
    const teamMembers = await MongoTeamMember.find(query)
      .populate<{ team: TeamSchema }>('team')
      .sort({ createTime: -1 })
      .lean();

    // 6. 格式化返回数据
    const teams = teamMembers
      .filter((tmb) => tmb.team) // 过滤掉团队已被删除的记录
      .map((tmb) => ({
        tmbId: String(tmb._id),
        teamId: String(tmb.teamId),
        teamName: tmb.team.name,
        teamAvatar: tmb.team.avatar,
        memberName: tmb.name,
        memberAvatar: tmb.avatar,
        role: tmb.role,
        status: tmb.status,
        createTime: tmb.createTime,
        balance: tmb.team.balance
      }));

    // 7. 返回结果
    return jsonRes<AdminUserTeamsResponse>(res, {
      data: {
        userId: String(user._id),
        username: user.username,
        teams,
        totalCount: teams.length,
        activeCount: teams.filter((t) => t.status === TeamMemberStatusEnum.active).length
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
