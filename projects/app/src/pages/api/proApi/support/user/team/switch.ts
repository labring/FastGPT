import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';
import { createUserSession, delUserAllSession } from '@fastgpt/service/support/user/session';
import { setCookie } from '@fastgpt/service/support/permission/controller';
import requestIp from 'request-ip';

export type SwitchTeamBody = {
  teamId: string;
};

async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  if (req.method !== 'PUT') {
    return jsonRes(res, { code: 405, message: 'Method not allowed' });
  }

  try {
    console.log('=== Team Switch (Open Source) ===');

    // 验证用户身份
    const { userId, sessionId, isRoot } = await authCert({ req, authToken: true });
    console.log('User ID:', userId);
    console.log('Session ID:', sessionId);
    console.log('Is Root:', isRoot);

    const { teamId } = req.body as SwitchTeamBody;
    console.log('Target Team ID:', teamId);

    if (!teamId) {
      console.log('Error: Team ID is required');
      return jsonRes(res, {
        code: 400,
        message: 'Team ID is required'
      });
    }

    // 检查目标团队是否存在
    const targetTeam = await MongoTeam.findById(teamId).lean();
    console.log('Target team found:', !!targetTeam, targetTeam?.name);

    if (!targetTeam) {
      console.log('Error: Team not found');
      return jsonRes(res, {
        code: 404,
        message: 'Team not found'
      });
    }

    // 检查用户是否是该团队的成员
    const teamMember = await MongoTeamMember.findOne({
      userId,
      teamId,
      status: TeamMemberStatusEnum.active
    }).lean();

    console.log('Team member found:', !!teamMember, teamMember?.role);

    if (!teamMember) {
      console.log('Error: User is not a member of this team');
      return jsonRes(res, {
        code: 403,
        message: 'You are not a member of this team'
      });
    }

    // 更新用户的团队信息
    const isOwner = targetTeam.ownerId.toString() === userId;
    const hasManagePer = teamMember.role === 'admin' || isOwner;

    // 1. 更新数据库中的用户信息
    await MongoUser.findByIdAndUpdate(userId, {
      $set: {
        'team.teamId': teamId,
        'team.tmbId': teamMember._id,
        'team.role': teamMember.role,
        'team.canWrite': true,
        'team.maxSize': 1000000,
        'team.teamName': targetTeam.name,
        'team.teamAvatar': targetTeam.avatar,
        'team.permission.isOwner': isOwner,
        'team.permission.hasWritePer': true,
        'team.permission.hasManagePer': hasManagePer,
        'team.permission.hasAppCreatePer': true,
        'team.permission.hasDatasetCreatePer': true
      }
    });

    console.log('User team info updated in database');

    // 2. 删除旧的session
    if (sessionId) {
      try {
        await delUserAllSession(userId);
        console.log('Old sessions deleted');
      } catch (sessionError) {
        console.error('Failed to delete old sessions:', sessionError);
      }
    }

    // 3. 创建新的session
    const newToken = await createUserSession({
      userId,
      teamId,
      tmbId: teamMember._id.toString(),
      isRoot: isRoot || false,
      ip: requestIp.getClientIp(req)
    });
    console.log('New session created');

    // 4. 设置新的cookie
    setCookie(res, newToken);
    console.log('New cookie set');

    return jsonRes(res, {
      data: teamId
    });
  } catch (err: any) {
    console.error('Team switch error:', err);
    return jsonRes(res, {
      code: 500,
      message: err.message || 'Internal server error'
    });
  }
}

export default handler;
