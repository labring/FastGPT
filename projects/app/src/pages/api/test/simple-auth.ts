import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { authCert } from '@fastgpt/service/support/permission/auth/common';

async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    // 检查cookie - 使用简单的字符串解析
    const cookieHeader = req.headers.cookie || '';
    const tokenMatch = cookieHeader.match(/fastgpt_token=([^;]+)/);
    const token = tokenMatch ? tokenMatch[1] : null;

    let session = null;
    if (token) {
      try {
        session = await authCert({ req, authToken: true });
      } catch (error) {
        console.log('Auth failed:', error);
      }
    }

    return jsonRes(res, {
      data: {
        hasToken: !!token,
        hasSession: !!session,
        sessionData: session
          ? {
              userId: session.userId,
              isRoot: session.isRoot,
              teamId: session.teamId,
              tmbId: session.tmbId,
              authType: session.authType
            }
          : null,
        cookies: req.headers.cookie ? 'Present' : 'Missing'
      }
    });
  } catch (err: any) {
    console.error('Simple auth check error:', err);
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
