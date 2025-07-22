import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';

async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  if (req.method !== 'GET') {
    return jsonRes(res, { code: 405, message: 'Method not allowed' });
  }

  try {
    console.log('=== Team Switch Debug ===');

    // 验证用户身份
    const { userId } = await authCert({ req, authToken: true });
    console.log('Current User ID:', userId);

    // 获取当前用户信息
    const currentUser = await MongoUser.findById(userId).lean();
    console.log('Current User:', {
      username: currentUser?.username,
      lastLoginTmbId: currentUser?.lastLoginTmbId
    });

    // 获取用户参与的所有团队
    const teamMembers = await MongoTeamMember.find({
      userId,
      status: TeamMemberStatusEnum.active
    }).lean();

    console.log('User team memberships:', teamMembers.length);

    // 获取团队详细信息
    const teamIds = teamMembers.map((member) => member.teamId);
    const teams = await MongoTeam.find({
      _id: { $in: teamIds }
    }).lean();

    console.log('Teams found:', teams.length);

    // 组合团队信息
    const userTeams = teamMembers.map((member) => {
      const team = teams.find((t) => t._id.toString() === member.teamId.toString());
      return {
        teamId: member.teamId.toString(),
        teamName: team?.name || 'Unknown Team',
        role: member.role,
        status: member.status,
        isOwner: team?.ownerId.toString() === userId
      };
    });

    // 测试团队切换逻辑
    const testResults = [];
    for (const team of userTeams) {
      try {
        // 模拟切换到这个团队
        const targetTeam = await MongoTeam.findById(team.teamId).lean();
        const teamMember = await MongoTeamMember.findOne({
          userId,
          teamId: team.teamId,
          status: TeamMemberStatusEnum.active
        }).lean();

        testResults.push({
          teamId: team.teamId,
          teamName: team.teamName,
          canSwitch: !!(targetTeam && teamMember),
          error: !targetTeam ? 'Team not found' : !teamMember ? 'Not a member' : null
        });
      } catch (error: any) {
        testResults.push({
          teamId: team.teamId,
          teamName: team.teamName,
          canSwitch: false,
          error: error.message
        });
      }
    }

    return jsonRes(res, {
      data: {
        currentUser: {
          id: userId,
          username: currentUser?.username,
          lastLoginTmbId: currentUser?.lastLoginTmbId
        },
        userTeams,
        testResults,
        summary: {
          totalTeams: userTeams.length,
          switchableTeams: testResults.filter((r) => r.canSwitch).length,
          errors: testResults.filter((r) => !r.canSwitch)
        }
      }
    });
  } catch (err: any) {
    console.error('Team switch debug error:', err);
    return jsonRes(res, {
      code: 500,
      message: err.message || 'Internal server error',
      error: {
        stack: err.stack,
        name: err.name
      }
    });
  }
}

export default handler;
