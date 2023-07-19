import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase } from '@/service/mongo';
import { authUser } from '@/service/utils/auth';
import { authApp } from '@/service/utils/auth';

/* 获取我的模型 */
export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    const { appId } = req.query as { appId: string };

    if (!appId) {
      throw new Error('参数错误');
    }

    // 凭证校验
    const { userId } = await authUser({ req, authToken: true });

    await connectToDatabase();

    const { app } = await authApp({
      appId,
      userId
    });

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
