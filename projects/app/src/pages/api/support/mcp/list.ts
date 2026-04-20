import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { MongoMcpKey } from '@fastgpt/service/support/mcp/schema';
import {
  McpListResponseSchema,
  type McpListResponseType
} from '@fastgpt/global/openapi/support/mcpServer/api';

async function handler(
  req: ApiRequestProps,
  res: ApiResponseType<any>
): Promise<McpListResponseType> {
  const { teamId, tmbId, permission } = await authUserPer({
    req,
    authToken: true,
    authApiKey: true
  });

  const list = await (async () => {
    if (permission.hasManagePer) {
      return await MongoMcpKey.find({ teamId }).lean().sort({ _id: -1 });
    }
    return await MongoMcpKey.find({ teamId, tmbId }).lean().sort({ _id: -1 });
  })();

  return McpListResponseSchema.parse(list);
}

export default NextAPI(handler);
