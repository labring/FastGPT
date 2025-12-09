import type { NextApiRequest, NextApiResponse } from 'next';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { NextAPI } from '@/service/middleware/entry';
import { MongoAppRegistration } from '@fastgpt/service/support/appRegistration/schema';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { getTeamPlanStatus } from '@fastgpt/service/support/wallet/sub/utils';

type CreateAppRegistrationBody = {
  appId: string;
};

/**
 * Admin API - 创建应用备案记录
 *
 * 功能说明:
 * 1. 使用 rootkey 认证（需要超级管理员权限）
 * 2. 检查应用是否存在
 * 3. 检查该应用是否已经备案（避免重复备案）
 * 4. 检查团队的备案应用配额是否已满
 * 5. 如果配额未满，创建备案记录
 *
 * 使用方式:
 * curl -X POST http://localhost:3000/api/admin/support/appRegistration/create \
 *   -H "Content-Type: application/json" \
 *   -H "rootkey: your-root-key" \
 *   -d '{"appId": "your-app-id"}'
 *
 */
async function handler(
  req: ApiRequestProps<CreateAppRegistrationBody>,
  res: NextApiResponse<any>
): Promise<{ success: boolean }> {
  const { appId } = req.body;

  if (!appId) {
    return Promise.reject('appId is required');
  }

  // 使用 rootkey 认证
  await authCert({
    req,
    authRoot: true
  });

  // 查找应用信息获取 teamId 和 tmbId
  const app = await MongoApp.findById(appId);
  if (!app) {
    return Promise.reject('App not found');
  }

  // 检查是否已存在备案记录
  const existingRegistration = await MongoAppRegistration.findOne({
    teamId: app.teamId,
    appId: app._id
  });
  if (existingRegistration) {
    return Promise.reject('Registration already exists for this app');
  }

  // 获取团队套餐信息
  const teamPlanStatus = await getTeamPlanStatus({ teamId: String(app.teamId) });
  const appRegistrationLimit = teamPlanStatus?.standardConstants?.appRegistrationCount;

  // 检查是否有配额限制
  if (appRegistrationLimit && appRegistrationLimit > 0) {
    // 统计当前团队已有的备案记录数
    const currentRegistrationCount = await MongoAppRegistration.countDocuments({
      teamId: app.teamId
    });

    // 检查是否已达到配额上限
    if (currentRegistrationCount >= appRegistrationLimit) {
      return Promise.reject(
        `Registration quota exceeded. Current: ${currentRegistrationCount}, Limit: ${appRegistrationLimit}`
      );
    }
  }

  // 创建备案记录
  await MongoAppRegistration.create({
    teamId: app.teamId,
    tmbId: app.tmbId,
    appId: app._id,
    createdAt: new Date()
  });

  return {
    success: true
  };
}

export default NextAPI(handler);
