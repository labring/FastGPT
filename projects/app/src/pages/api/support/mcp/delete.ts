import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authMcp } from '@fastgpt/service/support/permission/mcp/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoMcpKey } from '@fastgpt/service/support/mcp/schema';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  McpDeleteQuerySchema,
  McpDeleteResponseSchema,
  type McpDeleteResponseType
} from '@fastgpt/global/openapi/support/mcpServer/api';

async function handler(req: ApiRequestProps): Promise<McpDeleteResponseType> {
  const { id } = parseApiInput({ req, querySchema: McpDeleteQuerySchema }).query;

  await authMcp({
    req,
    authToken: true,
    authApiKey: true,
    mcpId: id,
    per: WritePermissionVal
  });

  await MongoMcpKey.deleteOne({ _id: id });

  return McpDeleteResponseSchema.parse(undefined);
}

export default NextAPI(handler);
