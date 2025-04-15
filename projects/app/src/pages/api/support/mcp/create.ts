import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { authAppByTmbId } from '@fastgpt/service/support/permission/app/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoMcpKey } from '@fastgpt/service/support/mcp/schema';
import { McpAppType } from '@fastgpt/global/support/mcp/type';

export type createQuery = {};

export type createBody = {
  apps: McpAppType[];
};

export type createResponse = {};

async function handler(
  req: ApiRequestProps<createBody, createQuery>,
  res: ApiResponseType<any>
): Promise<createResponse> {
  const { teamId, tmbId, permission } = await authUserPer({
    req,
    authToken: true,
    authApiKey: true
  });

  if (!permission.hasApikeyCreatePer) {
    return Promise.reject(TeamErrEnum.unPermission);
  }

  let { apps } = req.body;

  if (!apps.length) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  // 对 apps 中的 id 进行去重，确保每个应用只出现一次
  const uniqueAppIds = new Set();
  apps = apps.filter((app) => {
    if (uniqueAppIds.has(app.id)) {
      return false; // 过滤掉重复的 app id
    }
    uniqueAppIds.add(app.id);
    return true;
  });

  // Check app read permission
  await Promise.all(
    apps.map((app) =>
      authAppByTmbId({
        tmbId,
        appId: app.id,
        per: ReadPermissionVal
      })
    )
  );

  await MongoMcpKey.create({
    teamId,
    tmbId,
    apps
  });

  return {};
}

export default NextAPI(handler);
