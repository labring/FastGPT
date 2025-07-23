import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { authCert } from '@fastgpt/service/support/permission/auth/common';

async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  if (req.method !== 'GET') {
    return jsonRes(res, { code: 405, message: 'Method not allowed' });
  }

  try {
    // 测试普通token认证
    let tokenAuth = null;
    try {
      tokenAuth = await authCert({ req, authToken: true });
      console.log('Token auth result:', tokenAuth);
    } catch (tokenError) {
      console.log('Token auth error:', tokenError);
      tokenAuth = { error: (tokenError as any).message || 'Token auth failed' };
    }

    // 测试root权限认证
    let rootAuth = null;
    try {
      rootAuth = await authCert({ req, authRoot: true });
      console.log('Root auth result:', rootAuth);
    } catch (rootError) {
      console.log('Root auth error:', rootError);
      rootAuth = { error: (rootError as any).message || 'Root auth failed' };
    }

    return jsonRes(res, {
      data: {
        tokenAuth: (tokenAuth as any)?.error
          ? tokenAuth
          : {
              userId: tokenAuth?.userId,
              teamId: tokenAuth?.teamId,
              tmbId: tokenAuth?.tmbId,
              isRoot: tokenAuth?.isRoot,
              authType: tokenAuth?.authType
            },
        rootAuth,
        headers: {
          cookie: req.headers.cookie ? 'Present' : 'Missing',
          authorization: req.headers.authorization ? 'Present' : 'Missing',
          rootkey: req.headers.rootkey ? 'Present' : 'Missing'
        },
        timestamp: new Date().toISOString()
      }
    });
  } catch (err: any) {
    console.error('Auth check error:', err);
    return jsonRes(res, {
      code: 500,
      error: {
        message: err.message,
        stack: err.stack
      }
    });
  }
}

export default handler;
