import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { authUserSession } from '@fastgpt/service/support/user/session';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { parseHeaderCert } from '@fastgpt/service/support/permission/controller';
// import Cookie from 'cookie';

async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  if (req.method !== 'GET') {
    return jsonRes(res, { code: 405, message: 'Method not allowed' });
  }

  try {
    console.log('=== Session Debug ===');

    // 1. 检查原始请求头
    const cookieHeader = req.headers.cookie || '';
    const tokenMatch = cookieHeader.match(/fastgpt_token=([^;]+)/);
    const token = tokenMatch ? tokenMatch[1] : null;
    console.log('Raw cookie token:', token ? token.substring(0, 20) + '...' : 'None');

    // 2. 直接从session获取信息
    let sessionData = null;
    if (token) {
      try {
        sessionData = await authUserSession(token);
        console.log('Session data:', sessionData);
      } catch (sessionError) {
        console.error('Session error:', sessionError);
      }
    }

    // 3. 通过parseHeaderCert获取信息
    let certData = null;
    try {
      certData = await parseHeaderCert({ req, authToken: true });
      console.log('Cert data:', certData);
    } catch (certError) {
      console.error('Cert error:', certError);
    }

    // 4. 通过authCert获取信息
    let authData = null;
    try {
      authData = await authCert({ req, authToken: true });
      console.log('Auth data:', authData);
    } catch (authError) {
      console.error('Auth error:', authError);
    }

    // 5. 获取数据库中的用户信息
    let dbUserData = null;
    if (authData?.userId) {
      try {
        dbUserData = await MongoUser.findById(authData.userId).lean();
        console.log('DB User data:', {
          username: dbUserData?.username,
          lastLoginTmbId: dbUserData?.lastLoginTmbId
        });
      } catch (dbError) {
        console.error('DB error:', dbError);
      }
    }

    // 6. 获取团队成员信息
    let tmbData = null;
    if (authData?.tmbId) {
      try {
        tmbData = await MongoTeamMember.findById(authData.tmbId).populate('teamId', 'name').lean();
        console.log('TMB data:', tmbData);
      } catch (tmbError) {
        console.error('TMB error:', tmbError);
      }
    }

    // 7. 获取团队信息
    let teamData = null;
    if (authData?.teamId) {
      try {
        teamData = await MongoTeam.findById(authData.teamId).lean();
        console.log('Team data:', {
          _id: teamData?._id,
          name: teamData?.name,
          ownerId: teamData?.ownerId
        });
      } catch (teamError) {
        console.error('Team error:', teamError);
      }
    }

    return jsonRes(res, {
      data: {
        debug: {
          hasToken: !!token,
          tokenPreview: token ? token.substring(0, 20) + '...' : null,
          sessionData,
          certData,
          authData,
          dbUserData: dbUserData
            ? {
                username: dbUserData.username,
                lastLoginTmbId: dbUserData.lastLoginTmbId
              }
            : null,
          tmbData: tmbData
            ? {
                _id: tmbData._id,
                userId: tmbData.userId,
                teamId: tmbData.teamId,
                role: tmbData.role,
                teamName: (tmbData.teamId as any)?.name
              }
            : null,
          teamData: teamData
            ? {
                _id: teamData._id,
                name: teamData.name,
                ownerId: teamData.ownerId
              }
            : null
        },
        summary: {
          sessionTeamId: sessionData?.teamId,
          certTeamId: certData?.teamId,
          authTeamId: authData?.teamId,
          dbTeamId: null, // 用户模型没有直接的team字段
          tmbTeamId: tmbData?.teamId,
          actualTeamId: teamData?._id,
          allMatch:
            sessionData?.teamId === certData?.teamId && certData?.teamId === authData?.teamId
        }
      }
    });
  } catch (err: any) {
    console.error('Session debug error:', err);
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
