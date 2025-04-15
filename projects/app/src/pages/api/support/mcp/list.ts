import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { MongoMcpKey } from '@fastgpt/service/support/mcp/schema';
import { McpKeyType } from '@fastgpt/global/support/mcp/type';

export type listQuery = {};

export type listBody = {};

export type listResponse = McpKeyType[];

async function handler(
  req: ApiRequestProps<listBody, listQuery>,
  res: ApiResponseType<any>
): Promise<listResponse> {
  const { teamId, tmbId, permission } = await authUserPer({
    req,
    authToken: true,
    authApiKey: true
  });

  const list = await (async () => {
    if (permission.hasManagePer) {
      return await MongoMcpKey.find({ teamId }).lean();
    }
    return await MongoMcpKey.find({ teamId, tmbId }).lean();
  })();

  return list;
}

export default NextAPI(handler);
