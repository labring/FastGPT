import type { NextApiRequest, NextApiResponse } from 'next';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { NextAPI } from '@/service/middleware/entry';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { checkNode } from '@/service/core/app/utils';
import { rewriteAppWorkflowToDetail } from '@fastgpt/service/core/app/utils';
import { getGateConfig } from '@fastgpt/service/support/user/team/gate/controller';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { TeamReadPermissionVal } from '@fastgpt/global/support/permission/user/constant';

/* 获取特色应用详情 - 只允许获取特色应用列表中的应用 */
async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  const { appId } = req.query as { appId: string };

  if (!appId) {
    throw CommonErrEnum.missingParams;
  }

  // 先验证用户团队权限
  const { teamId: userTeamId } = await authUserPer({
    req,
    authToken: true,
    authApiKey: true,
    per: TeamReadPermissionVal
  });

  // 获取团队门户配置中的特色应用列表
  const gateConfig = await getGateConfig(userTeamId);

  if (!gateConfig || !gateConfig.featuredApps?.length) {
    throw new Error('特色应用列表为空');
  }

  // 验证请求的应用是否在特色应用列表中
  const isInFeaturedApps = gateConfig.featuredApps.includes(appId);
  if (!isInFeaturedApps) {
    throw new Error('该应用不在特色应用列表中');
  }

  // 验证应用权限
  const { app, teamId, isRoot } = await authApp({
    req,
    authToken: true,
    appId,
    per: TeamReadPermissionVal
  });

  // 确保应用属于同一个团队
  if (String(teamId) !== String(userTeamId)) {
    throw new Error('无权限访问该应用');
  }

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
