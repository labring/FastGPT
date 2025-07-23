import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { getTmbInfoByTmbId } from '@fastgpt/service/support/user/team/controller';

async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  if (req.method !== 'POST') {
    return jsonRes(res, { code: 405, message: 'Method not allowed' });
  }

  try {
    console.log('=== Database Apps Debug ===');

    // 验证用户身份
    const { tmbId, userId } = await authCert({ req, authToken: true });
    console.log('User ID:', userId);
    console.log('TMB ID:', tmbId);

    // 获取用户团队信息
    const tmbInfo = await getTmbInfoByTmbId({ tmbId });
    console.log('TMB Info:', {
      teamId: tmbInfo.teamId,
      teamName: tmbInfo.teamName,
      role: tmbInfo.role,
      status: tmbInfo.status
    });

    // 查询当前团队的所有应用
    const currentTeamApps = await MongoApp.find({ teamId: tmbInfo.teamId }).lean();
    console.log(`Found ${currentTeamApps.length} apps for current team (${tmbInfo.teamId})`);

    // 查询数据库中所有应用
    const allApps = await MongoApp.find({}).lean();
    console.log(`Found ${allApps.length} total apps in database`);

    // 按团队分组统计应用
    const appsByTeam: Record<string, any[]> = {};
    for (const app of allApps) {
      const teamId = app.teamId.toString();
      if (!appsByTeam[teamId]) {
        appsByTeam[teamId] = [];
      }
      appsByTeam[teamId].push({
        _id: app._id,
        name: app.name,
        type: app.type,
        createTime: (app as any).createTime || new Date()
      });
    }

    // 获取所有团队信息
    const allTeams = await MongoTeam.find({}).lean();
    const teamMap: Record<string, string> = {};
    for (const team of allTeams) {
      teamMap[team._id.toString()] = team.name;
    }

    // 获取用户的所有团队成员关系
    const userTeamMemberships = await MongoTeamMember.find({ userId }).lean();
    console.log(`User has ${userTeamMemberships.length} team memberships`);

    const userTeams = [];
    for (const membership of userTeamMemberships) {
      const teamId = membership.teamId.toString();
      const team = await MongoTeam.findById(membership.teamId).lean();
      if (team) {
        userTeams.push({
          teamId: teamId,
          teamName: team.name,
          role: membership.role,
          status: membership.status,
          appCount: appsByTeam[teamId]?.length || 0,
          apps: appsByTeam[teamId] || []
        });
      }
    }

    const result = {
      summary: {
        currentUserId: userId,
        currentTmbId: tmbId,
        currentTeamId: tmbInfo.teamId,
        currentTeamName: tmbInfo.teamName,
        currentTeamAppCount: currentTeamApps.length,
        totalAppsInDatabase: allApps.length,
        userTeamCount: userTeams.length
      },
      currentTeamApps: currentTeamApps.map((app) => ({
        _id: app._id,
        name: app.name,
        type: app.type,
        teamId: app.teamId,
        createTime: (app as any).createTime || new Date()
      })),
      userTeams: userTeams,
      allTeamsWithApps: Object.keys(appsByTeam).map((teamId) => ({
        teamId,
        teamName: teamMap[teamId] || 'Unknown Team',
        appCount: appsByTeam[teamId].length,
        apps: appsByTeam[teamId]
      })),
      rawData: {
        tmbInfo,
        userTeamMemberships: userTeamMemberships.map((m) => ({
          teamId: m.teamId,
          role: m.role,
          status: m.status
        }))
      }
    };

    console.log('Database Apps Debug Result:', JSON.stringify(result.summary, null, 2));

    return jsonRes(res, {
      data: result
    });
  } catch (error) {
    console.error('Database Apps Debug Error:', error);
    return jsonRes(res, {
      code: 500,
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
}

export default handler;
