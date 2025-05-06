import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authMcp } from '../../../../../../../packages/service/support/permission/mcp/auth';
import { ReadPermissionVal, WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { authAppByTmbId } from '@fastgpt/service/support/permission/app/auth';
import { MongoMcpKey } from '@fastgpt/service/support/mcp/schema';
import { type McpAppType } from '@fastgpt/global/support/mcp/type';

export type updateQuery = {};

export type updateBody = {
  id: string;
  name: string;
  apps: McpAppType[];
};

export type updateResponse = {};

async function handler(
  req: ApiRequestProps<updateBody, updateQuery>,
  res: ApiResponseType<any>
): Promise<updateResponse> {
  let { id: mcpId, name, apps } = req.body;
  const { tmbId } = await authMcp({
    req,
    authToken: true,
    authApiKey: true,
    mcpId,
    per: WritePermissionVal
  });

  // 对 apps 中的 id 进行去重，确保每个应用只出现一次
  const uniqueAppIds = new Set();
  apps = apps.filter((app) => {
    if (uniqueAppIds.has(app.appId)) {
      return false; // 过滤掉重复的 app id
    }
    uniqueAppIds.add(app.appId);
    return true;
  });

  // Check app read permission
  await Promise.all(
    apps.map((app) =>
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
        apps
      }
    }
  );

  return {};
}

export default NextAPI(handler);
