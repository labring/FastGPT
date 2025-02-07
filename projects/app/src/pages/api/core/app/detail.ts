import type { NextApiRequest, NextApiResponse } from 'next';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { NextAPI } from '@/service/middleware/entry';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { checkApp } from '@/service/core/app/utils';

/* 获取应用详情 */
async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  const { appId } = req.query as { appId: string };

  if (!appId) {
    Promise.reject(CommonErrEnum.missingParams);
  }
  // 凭证校验
  const { app } = await authApp({ req, authToken: true, appId, per: ReadPermissionVal });

  if (!app.permission.hasWritePer) {
    return {
      ...app,
      modules: [],
      edges: []
    };
  }

  return checkApp(app, req);
}

export default NextAPI(handler);
