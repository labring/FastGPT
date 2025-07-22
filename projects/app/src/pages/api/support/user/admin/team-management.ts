import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { authAdmin } from '@/service/support/permission/admin';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';

export type UserTeamInfo = {
  _id: string;
  username: string;
  status: string;
  createTime: Date;
  teams: {
    _id: string;
    teamId: string;
    teamName: string;
    role: string;
    status: string;
    isOwner: boolean;
    createTime: Date;
  }[];
  totalTeams: number;
};

export type TeamManagementBody = {
  userId: string;
  action: 'add' | 'remove' | 'updateRole';
  teamId?: string;
  role?: string;
};

async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    // 验证管理员权限
    await authAdmin(req);

    if (req.method === 'GET') {
      // 获取用户的团队信息
      const { userId } = req.query as { userId: string };

      if (!userId) {
        return jsonRes(res, {
          code: 400,
          message: 'User ID is required'
        });
      }

      // 检查用户是否存在
      const user = await MongoUser.findById(userId).lean();
      if (!user) {
        return jsonRes(res, {
          code: 404,
          message: 'User not found'
        });
      }

      // 获取用户的团队成员关系
      const teamMembers = await MongoTeamMember.find({ userId }).lean();

      // 获取团队信息
      const teamIds = teamMembers.map((member) => member.teamId);
      const teams = await MongoTeam.find({ _id: { $in: teamIds } }).lean();

      // 格式化团队信息
      const userTeams = teamMembers.map((member) => {
        const team = teams.find((t) => t._id.toString() === member.teamId.toString());
        return {
          _id: member._id,
          teamId: member.teamId.toString(),
          teamName: team?.name || 'Unknown Team',
          role: member.role || 'member',
          status: member.status,
          isOwner: team?.ownerId.toString() === userId,
          createTime: member.createTime
        };
      });

      const userTeamInfo: UserTeamInfo = {
        _id: user._id,
        username: user.username,
        status: user.status,
        createTime: new Date(user.createTime),
        teams: userTeams,
        totalTeams: userTeams.length
      };

      return jsonRes(res, {
        data: userTeamInfo
      });
    } else if (req.method === 'POST') {
      // 管理用户的团队关系
      const { userId, action, teamId, role } = req.body as TeamManagementBody;

      if (!userId || !action) {
        return jsonRes(res, {
          code: 400,
          message: 'User ID and action are required'
        });
      }

      // 检查用户是否存在
      const user = await MongoUser.findById(userId);
      if (!user) {
        return jsonRes(res, {
          code: 404,
          message: 'User not found'
        });
      }

      switch (action) {
        case 'add':
          if (!teamId) {
            return jsonRes(res, {
              code: 400,
              message: 'Team ID is required for add action'
            });
          }

          // 检查团队是否存在
          const team = await MongoTeam.findById(teamId);
          if (!team) {
            return jsonRes(res, {
              code: 404,
              message: 'Team not found'
            });
          }

          // 检查用户是否已经是团队成员
          const existingMember = await MongoTeamMember.findOne({
            userId,
            teamId
          });

          if (existingMember) {
            return jsonRes(res, {
              code: 400,
              message: 'User is already a member of this team'
            });
          }

          // 添加用户到团队
          await MongoTeamMember.create({
            teamId,
            userId,
            name: user.username,
            role: role || 'member',
            status: 'active',
            createTime: new Date()
          });

          return jsonRes(res, {
            data: { message: 'User added to team successfully' }
          });

        case 'remove':
          if (!teamId) {
            return jsonRes(res, {
              code: 400,
              message: 'Team ID is required for remove action'
            });
          }

          // 检查用户是否是团队所有者
          const teamToRemove = await MongoTeam.findById(teamId);
          if (teamToRemove && teamToRemove.ownerId.toString() === userId) {
            return jsonRes(res, {
              code: 400,
              message: 'Cannot remove team owner from team'
            });
          }

          // 从团队中移除用户
          const removedMember = await MongoTeamMember.findOneAndDelete({
            userId,
            teamId
          });

          if (!removedMember) {
            return jsonRes(res, {
              code: 404,
              message: 'User is not a member of this team'
            });
          }

          return jsonRes(res, {
            data: { message: 'User removed from team successfully' }
          });

        case 'updateRole':
          if (!teamId || !role) {
            return jsonRes(res, {
              code: 400,
              message: 'Team ID and role are required for updateRole action'
            });
          }

          // 更新用户在团队中的角色
          const updatedMember = await MongoTeamMember.findOneAndUpdate(
            { userId, teamId },
            { role, updateTime: new Date() },
            { new: true }
          );

          if (!updatedMember) {
            return jsonRes(res, {
              code: 404,
              message: 'User is not a member of this team'
            });
          }

          return jsonRes(res, {
            data: { message: 'User role updated successfully' }
          });

        default:
          return jsonRes(res, {
            code: 400,
            message: 'Invalid action'
          });
      }
    } else {
      return jsonRes(res, {
        code: 405,
        message: 'Method not allowed'
      });
    }
  } catch (err: any) {
    console.error('Team management error:', err);
    return jsonRes(res, {
      code: 500,
      message: err.message || 'Internal server error'
    });
  }
}

export default handler;
