import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { authApp } from '@fastgpt/service/support/permission/auth/app';
import { NextAPI } from '@/service/middleware/entry';

/* 获取我的模型 */
async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  const { appId } = req.query as { appId: string };

  if (!appId) {
    throw new Error('参数错误');
  }

  // 凭证校验
  const { app } = await authApp({ req, authToken: true, appId, per: 'w' });

  return app;
}

export default NextAPI(handler);
