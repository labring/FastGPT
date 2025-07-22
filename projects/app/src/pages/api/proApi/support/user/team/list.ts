import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';
import type { TeamTmbItemType } from '@fastgpt/global/support/user/team/type';
import { TeamPermission } from '@fastgpt/global/support/permission/user/controller';

async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  if (req.method !== 'GET') {
    return jsonRes(res, { code: 405, message: 'Method not allowed' });
  }

  try {
    console.log('=== Get Team List (Open Source) ===');

    // 验证用户身份
    const { userId } = await authCert({ req, authToken: true });
    console.log('User ID:', userId);

    const { status = TeamMemberStatusEnum.active } = req.query;
    console.log('Status filter:', status);

    // 获取用户参与的所有团队
    const teamMembers = await MongoTeamMember.find({
      userId,
      status: status as TeamMemberStatusEnum
    }).lean();

    console.log(`Found ${teamMembers.length} team memberships`);

    if (teamMembers.length === 0) {
      return jsonRes(res, {
        data: []
      });
    }

    // 获取团队详细信息
    const teamIds = teamMembers.map((member) => member.teamId);
    const teams = await MongoTeam.find({
      _id: { $in: teamIds }
    }).lean();

    console.log(`Found ${teams.length} teams`);

    // 获取每个团队的成员数量
    const teamMemberCounts = await Promise.all(
      teamIds.map(async (teamId) => {
        const count = await MongoTeamMember.countDocuments({
          teamId,
          status: TeamMemberStatusEnum.active
        });
        return { teamId: teamId.toString(), count };
      })
    );

    // 组合团队信息
    const userTeams: TeamTmbItemType[] = teamMembers.map((member) => {
      const team = teams.find((t) => t._id.toString() === member.teamId.toString());
      const memberCount =
        teamMemberCounts.find((mc) => mc.teamId === member.teamId.toString())?.count || 0;

      return {
        userId: member.userId.toString(),
        teamId: member.teamId.toString(),
        teamName: team?.name || 'Unknown Team',
        teamAvatar: team?.avatar || '/icon/logo.svg',
        memberName: member.name,
        avatar: member.avatar,
        role: member.role,
        status: member.status,
        balance: 0, // 开源版不需要余额信息
        tmbId: member._id.toString(),
        teamDomain: team?.teamDomain || '',
        notificationAccount: team?.notificationAccount,
        permission: new TeamPermission({
          per: 7, // 给团队成员完整权限
          isOwner: team?.ownerId.toString() === userId
        }),
        lafAccount: team?.lafAccount || undefined,
        openaiAccount: team?.openaiAccount || undefined,
        externalWorkflowVariables: team?.externalWorkflowVariables || undefined
      };
    });

    console.log(`Returning ${userTeams.length} teams`);

    return jsonRes(res, {
      data: userTeams
    });
  } catch (err: any) {
    console.error('Get team list error:', err);
    return jsonRes(res, {
      code: 500,
      message: err.message || 'Internal server error'
    });
  }
}

export default handler;
