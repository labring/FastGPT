import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { authApp } from '@fastgpt/service/support/permission/auth/app';

/* 获取我的模型 */
export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();
    const { appId } = req.query as { appId: string };

    if (!appId) {
      throw new Error('参数错误');
    }

    // 凭证校验
    const { app } = await authApp({ req, authToken: true, appId, per: 'w' });

    jsonRes(res, {
      data: app
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
