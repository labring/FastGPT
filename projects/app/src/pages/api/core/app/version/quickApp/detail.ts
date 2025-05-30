import type { NextApiRequest, NextApiResponse } from 'next';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { NextAPI } from '@/service/middleware/entry';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { rewriteAppWorkflowToDetail } from '@fastgpt/service/core/app/utils';
import { getGateConfig } from '@fastgpt/service/support/user/team/gate/controller';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { TeamReadPermissionVal } from '@fastgpt/global/support/permission/user/constant';

/* 获取快捷应用详情 - 只允许获取快捷应用列表中的应用 */
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

  // 获取团队门户配置中的快速应用列表
  const gateConfig = await getGateConfig(userTeamId);

  if (!gateConfig || !gateConfig.quickApps?.length) {
    throw new Error('快捷应用列表为空');
  }

  // 验证请求的应用是否在快捷应用列表中
  const isInQuickApps = gateConfig.quickApps.includes(appId);
  if (!isInQuickApps) {
    throw new Error('该应用不在快捷应用列表中');
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
    ownerTmbId: app.tmbId,
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
    ...app
  };
}

export default NextAPI(handler);
