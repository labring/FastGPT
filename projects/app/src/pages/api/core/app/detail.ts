import type { NextApiRequest, NextApiResponse } from 'next';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { NextAPI } from '@/service/middleware/entry';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { checkNode } from '@/service/core/app/utils';
import { rewriteAppWorkflowToDetail } from '@fastgpt/service/core/app/utils';
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
    isRoot
  });

  if (!app.permission.hasWritePer) {
    return {
      ...app,
      modules: [],
      edges: []
    };
  }

  return {
    ...app,
    modules: await Promise.all(
      app.modules.map((node) => checkNode({ node, ownerTmbId: app.tmbId }))
    )
  };
}

export default NextAPI(handler);
