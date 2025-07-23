import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { getUserDetail } from '@fastgpt/service/support/user/controller';

async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  if (req.method !== 'GET') {
    return jsonRes(res, { code: 405, message: 'Method not allowed' });
  }

  try {
    // 获取当前用户信息
    const authResult = await authCert({ req, authToken: true });
    console.log('Current user auth:', authResult);

    // 获取用户详细信息
    const userDetail = await getUserDetail({ tmbId: authResult.tmbId });
    console.log('User detail:', {
      username: userDetail.username,
      isRoot: authResult.isRoot
    });

    return jsonRes(res, {
      data: {
        auth: {
          userId: authResult.userId,
          teamId: authResult.teamId,
          tmbId: authResult.tmbId,
          isRoot: authResult.isRoot,
          authType: authResult.authType
        },
        user: {
          username: userDetail.username,
          _id: userDetail._id
        },
        isRootUser: userDetail.username === 'root',
        sessionIsRoot: authResult.isRoot,
        canAccessAdmin: userDetail.username === 'root' && authResult.isRoot
      }
    });
  } catch (err: any) {
    console.error('Current user check error:', err);
    return jsonRes(res, {
      code: 500,
      error: {
        message: err.message,
        type: err.constructor.name
      }
    });
  }
}

export default handler;
