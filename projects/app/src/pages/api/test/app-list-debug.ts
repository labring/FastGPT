import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoApp } from '@fastgpt/service/core/app/schema';

async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  if (req.method !== 'GET') {
    return jsonRes(res, { code: 405, message: 'Method not allowed' });
  }

  try {
    console.log('=== App List Debug ===');

    // 1. 获取用户权限信息
    const {
      tmbId,
      teamId,
      permission: teamPer
    } = await authUserPer({
      req,
      authToken: true,
      authApiKey: true,
      per: ReadPermissionVal
    });

    console.log('Auth result:', { tmbId, teamId, teamPer: teamPer.value });

    // 2. 查询该团队的所有应用
    const teamApps = await MongoApp.find({ teamId }).lean();
    console.log(`Found ${teamApps.length} apps for team ${teamId}`);
    teamApps.forEach((app) => {
      console.log(`  - App: ${app.name} (${app._id}) by ${app.tmbId}`);
    });

    // 3. 查询用户创建的应用
    const userApps = await MongoApp.find({ tmbId }).lean();
    console.log(`Found ${userApps.length} apps created by user ${tmbId}`);

    // 4. 查询所有应用（用于对比）
    const allApps = await MongoApp.find({}).lean();
    console.log(`Total ${allApps.length} apps in system`);

    // 5. 模拟应用列表API的查询逻辑
    console.log('=== Simulating app list API logic ===');
    const findAppsQuery = {
      teamId,
      ...{} // parentId filter would go here
    };
    console.log('Query:', findAppsQuery);

    const myApps = await MongoApp.find(
      findAppsQuery,
      '_id parentId avatar type name intro tmbId updateTime pluginData inheritPermission'
    )
      .sort({ updateTime: -1 })
      .lean();

    console.log(
      `Query returned ${myApps.length} apps:`,
      myApps.map((app) => ({
        _id: app._id,
        name: app.name,
        type: app.type,
        tmbId: app.tmbId,
        teamId: teamId // This should match
      }))
    );

    // 5. 按团队分组统计
    const appsByTeam = allApps.reduce(
      (acc, app) => {
        const teamId = app.teamId.toString();
        if (!acc[teamId]) {
          acc[teamId] = [];
        }
        acc[teamId].push({
          _id: app._id,
          name: app.name,
          tmbId: app.tmbId,
          type: app.type
        });
        return acc;
      },
      {} as Record<string, any[]>
    );

    console.log(
      'Apps by team:',
      Object.keys(appsByTeam).map((teamId) => ({
        teamId,
        count: appsByTeam[teamId].length
      }))
    );

    return jsonRes(res, {
      data: {
        auth: {
          tmbId,
          teamId,
          teamPermission: teamPer.value
        },
        apps: {
          teamApps: teamApps.map((app) => ({
            _id: app._id,
            name: app.name,
            teamId: app.teamId,
            tmbId: app.tmbId,
            type: app.type
          })),
          userApps: userApps.map((app) => ({
            _id: app._id,
            name: app.name,
            teamId: app.teamId,
            tmbId: app.tmbId,
            type: app.type
          })),
          appsByTeam
        },
        summary: {
          currentTeamId: teamId,
          teamAppCount: teamApps.length,
          userAppCount: userApps.length,
          totalAppCount: allApps.length,
          teamsWithApps: Object.keys(appsByTeam).length
        }
      }
    });
  } catch (err: any) {
    console.error('App list debug error:', err);
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
