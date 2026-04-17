import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authMcp } from '@fastgpt/service/support/permission/mcp/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoMcpKey } from '@fastgpt/service/support/mcp/schema';
import {
  McpDeleteQuerySchema,
  McpDeleteResponseSchema,
  type McpDeleteResponseType
} from '@fastgpt/global/openapi/support/mcpServer/api';

async function handler(
  req: ApiRequestProps,
  res: ApiResponseType<any>
): Promise<McpDeleteResponseType> {
  const { id } = McpDeleteQuerySchema.parse(req.query);

  await authMcp({
    req,
    authToken: true,
    authApiKey: true,
    mcpId: id,
    per: WritePermissionVal
  });

  await MongoMcpKey.deleteOne({ _id: id });

  return McpDeleteResponseSchema.parse({});
}

export default NextAPI(handler);
