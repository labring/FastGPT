import type { NextApiRequest, NextApiResponse } from 'next';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { NextAPI } from '@/service/middleware/entry';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { rewriteAppWorkflowToDetail } from '@fastgpt/service/core/app/utils';
import { getLocale } from '@fastgpt/service/common/middle/i18n';

/* 获取应用详情 */
async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  const { appId } = req.query as { appId: string };

  if (!appId) {
    Promise.reject(CommonErrEnum.missingParams);
  }
  // 凭证校验
  const { app, teamId, isRoot } = await authApp({
    req,
    authToken: true,
    appId,
    per: ReadPermissionVal
  });

  await rewriteAppWorkflowToDetail({
    nodes: app.modules,
    teamId,
    ownerTmbId: app.tmbId,
    isRoot,
    lang: getLocale(req)
  });

  if (!app.permission.hasWritePer) {
    return {
      ...app,
      modules: [],
      edges: []
    };
  }

  return app;
}

export default NextAPI(handler);
