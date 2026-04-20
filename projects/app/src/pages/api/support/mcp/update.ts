import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authMcp } from '@fastgpt/service/support/permission/mcp/auth';
import { ReadPermissionVal, WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { authAppByTmbId } from '@fastgpt/service/support/permission/app/auth';
import { MongoMcpKey } from '@fastgpt/service/support/mcp/schema';
import {
  McpUpdateBodySchema,
  McpUpdateResponseSchema,
  type McpUpdateResponseType
} from '@fastgpt/global/openapi/support/mcpServer/api';

async function handler(
  req: ApiRequestProps,
  res: ApiResponseType<any>
): Promise<McpUpdateResponseType> {
  const { id: mcpId, name, apps } = McpUpdateBodySchema.parse(req.body);
  const { tmbId } = await authMcp({
    req,
    authToken: true,
    authApiKey: true,
    mcpId,
    per: WritePermissionVal
  });

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

  await MongoMcpKey.updateOne(
    { _id: mcpId },
    {
      $set: {
        ...(name && { name }),
        apps: uniqueApps
      }
    }
  );

  return McpUpdateResponseSchema.parse({});
}

export default NextAPI(handler);
