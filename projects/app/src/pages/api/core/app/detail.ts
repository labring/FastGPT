import type { NextApiRequest, NextApiResponse } from 'next';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { NextAPI } from '@/service/middleware/entry';
import { ReadPermissionVal, WritePermissionVal } from '@fastgpt/global/support/permission/constant';

/* 获取我的模型 */
async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  const { appId } = req.query as { appId: string };

  if (!appId) {
    throw new Error('参数错误');
  }
  // 凭证校验
  const { app } = await authApp({ req, authToken: true, appId, per: ReadPermissionVal });

  if (!app.permission.hasWritePer) {
    app.modules = [];
    app.edges = [];
  }

  return app;
}

export default NextAPI(handler);
