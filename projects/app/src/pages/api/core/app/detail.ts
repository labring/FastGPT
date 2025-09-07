import type { NextApiRequest, NextApiResponse } from 'next';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { NextAPI } from '@/service/middleware/entry';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { rewriteAppWorkflowToDetail } from '@fastgpt/service/core/app/utils';
import { getLocale } from '@fastgpt/service/common/middle/i18n';
import { MongoApp } from '@fastgpt/service/core/app/schema';

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

  const rawApp = await MongoApp.findOne({ _id: appId }).lean();

  if (!rawApp) {
    return Promise.reject(AppErrEnum.unExist);
  }

  const finalApp = {
    ...rawApp,
    permission: app.permission
  };

  await rewriteAppWorkflowToDetail({
    nodes: finalApp.modules || [],
    teamId,
    ownerTmbId: finalApp.tmbId || '',
    isRoot,
    lang: getLocale(req)
  });

  if (!finalApp.permission.hasWritePer) {
    return {
      ...finalApp,
      modules: [],
      edges: []
    };
  }

  return finalApp;
}

export default NextAPI(handler);
