import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authMcp } from '@fastgpt/service/support/permission/mcp/auth';
import { ReadPermissionVal, WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { authAppByTmbId } from '@fastgpt/service/support/permission/app/auth';
import { MongoMcpKey } from '@fastgpt/service/support/mcp/schema';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  McpUpdateBodySchema,
  McpUpdateResponseSchema,
  type McpUpdateResponseType
} from '@fastgpt/global/openapi/support/mcpServer/api';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';

async function handler(req: ApiRequestProps): Promise<McpUpdateResponseType> {
  const {
    id: mcpId,
    name,
    apps,
    authProxy
  } = parseApiInput({
    req,
    bodySchema: McpUpdateBodySchema
  }).body;
  const { tmbId, permission } = await authMcp({
    req,
    authToken: true,
    authApiKey: true,
    mcpId,
    per: WritePermissionVal
  });

  if (authProxy && !permission.isOwner) {
    return Promise.reject(TeamErrEnum.unPermission);
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

  await MongoMcpKey.updateOne(
    { _id: mcpId },
    {
      $set: {
        ...(name && { name }),
        ...(authProxy !== undefined && { authProxy }),
        apps: uniqueApps
      }
    }
  );

  return McpUpdateResponseSchema.parse(undefined);
}

export default NextAPI(handler);
