import type { NextApiResponse } from 'next';
import z from 'zod';
import { EntityIdStringSchema } from '@fastgpt/global/common/string/entityId';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { appRegistrationService } from '@fastgpt/service/support/appRegistration/service';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { getTeamPlanStatus } from '@fastgpt/service/support/wallet/sub/utils';
import { NextAPI } from '@/service/middleware/entry';

const CreateAppRegistrationBodySchema = z.object({
  appId: EntityIdStringSchema
});

type CreateAppRegistrationBody = z.infer<typeof CreateAppRegistrationBodySchema>;

/**
 * Admin API - 创建应用备案记录
 *
 * 功能说明:
 * 1. 使用 rootkey 认证（需要超级管理员权限）
 * 2. 查找应用信息获取 teamId 与 tmbId
 * 3. 在事务内完成查重、配额上限校验并创建备案记录
 *
 * 使用方式:
 * curl -X POST http://localhost:3000/api/admin/support/appRegistration/create \
 *   -H "Content-Type: application/json" \
 *   -H "rootkey: your-root-key" \
 *   -d '{"appId": "your-app-id"}'
 */
async function handler(
  req: ApiRequestProps<CreateAppRegistrationBody>,
  _res: NextApiResponse
): Promise<{ success: boolean }> {
  // 1. 先校验超级管理员（rootkey）权限与合法的 appId 入参
  await authCert({
    req,
    authRoot: true
  });
  const { appId } = parseApiInput({
    req,
    bodySchema: CreateAppRegistrationBodySchema
  }).body;

  // 2. 查应用与套餐限额（在事务外完成只读元信息获取，避免拉长写事务）
  const app = await MongoApp.findById(appId);
  if (!app) {
    return Promise.reject('App not found');
  }
  const teamId = String(app.teamId);
  const teamPlanStatus = await getTeamPlanStatus({ teamId });

  // 3. 在事务内校验重复备案与配额限制并落库
  await appRegistrationService.registerApp({
    teamId,
    tmbId: String(app.tmbId),
    appId: String(app._id),
    quotaLimit: teamPlanStatus?.standard?.appRegistrationCount
  });

  return {
    success: true
  };
}

export default NextAPI(handler);
