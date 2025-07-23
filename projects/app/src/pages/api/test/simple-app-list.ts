import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { getTmbInfoByTmbId } from '@fastgpt/service/support/user/team/controller';

async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  if (req.method !== 'POST') {
    return jsonRes(res, { code: 405, message: 'Method not allowed' });
  }

  try {
    console.log('=== Simple App List ===');

    // 验证用户身份
    const { tmbId, userId } = await authCert({ req, authToken: true });
    console.log('User ID:', userId);
    console.log('TMB ID:', tmbId);

    // 获取用户团队信息
    const tmbInfo = await getTmbInfoByTmbId({ tmbId });
    console.log('TMB Info:', {
      teamId: tmbInfo.teamId,
      teamName: tmbInfo.teamName,
      role: tmbInfo.role
    });

    // 直接查询当前团队的所有应用，不考虑权限
    const apps = await MongoApp.find(
      {
        teamId: tmbInfo.teamId
      },
      '_id name type avatar intro updateTime'
    ).lean();

    console.log(`Found ${apps.length} apps for team ${tmbInfo.teamId}`);

    const result = {
      summary: {
        userId: userId,
        tmbId: tmbId,
        teamId: tmbInfo.teamId,
        teamName: tmbInfo.teamName,
        appCount: apps.length
      },
      apps: apps.map((app) => ({
        _id: app._id,
        name: app.name,
        type: app.type,
        avatar: app.avatar,
        intro: app.intro,
        updateTime: app.updateTime
      }))
    };

    console.log('Simple App List Result:', JSON.stringify(result.summary, null, 2));

    return jsonRes(res, {
      data: result
    });
  } catch (error) {
    console.error('Simple App List Error:', error);
    return jsonRes(res, {
      code: 500,
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
}

export default handler;
