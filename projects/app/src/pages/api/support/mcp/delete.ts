import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authMcp } from '@fastgpt/service/support/permission/mcp/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoMcpKey } from '@fastgpt/service/support/mcp/schema';

export type deleteQuery = {
  id: string;
};

export type deleteBody = {};

export type deleteResponse = {};

async function handler(
  req: ApiRequestProps<deleteBody, deleteQuery>,
  res: ApiResponseType<any>
): Promise<deleteResponse> {
  const { id } = req.query;

  await authMcp({
    req,
    authToken: true,
    authApiKey: true,
    mcpId: id,
    per: WritePermissionVal
  });

  await MongoMcpKey.deleteOne({ _id: id });

  return {};
}

export default NextAPI(handler);
