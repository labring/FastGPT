import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { authAppByTmbId } from '@fastgpt/service/support/permission/app/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoMcpKey } from '@fastgpt/service/support/mcp/schema';
import {
  McpCreateBodySchema,
  McpCreateResponseSchema,
  type McpCreateResponseType
} from '@fastgpt/global/openapi/support/mcpServer/api';

async function handler(
  req: ApiRequestProps,
  res: ApiResponseType<any>
): Promise<McpCreateResponseType> {
  const { teamId, tmbId, permission } = await authUserPer({
    req,
    authToken: true,
    authApiKey: true
  });

  if (!permission.hasApikeyCreatePer) {
    return Promise.reject(TeamErrEnum.unPermission);
  }

  const { name, apps } = McpCreateBodySchema.parse(req.body);

  // Count mcp length
  const totalMcp = await MongoMcpKey.countDocuments({ teamId });
  if (totalMcp >= 100) {
    return Promise.reject('暂时只支持100个MCP服务');
  }

  // 对 apps 中的 id 进行去重，确保每个应用只出现一次
  const uniqueAppIds = new Set<string>();
  const uniqueApps = apps.filter((app) => {
    if (uniqueAppIds.has(app.appId)) {
      return false;
    }
    uniqueAppIds.add(app.appId);
    return true;
  });

  // Check app read permission
  await Promise.all(
    uniqueApps.map((app) =>
      authAppByTmbId({
        tmbId,
        appId: app.appId,
        per: ReadPermissionVal
      })
    )
  );

  await MongoMcpKey.create({
    teamId,
    tmbId,
    name,
    apps: uniqueApps
  });

  return McpCreateResponseSchema.parse({});
}

export default NextAPI(handler);
