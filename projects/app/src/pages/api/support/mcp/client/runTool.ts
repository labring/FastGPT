import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { MCPClient } from '@fastgpt/service/core/app/mcp';
import { type StoreSecretValueType } from '@fastgpt/global/common/secret/type';
import { getSecretValue } from '@fastgpt/global/common/secret/utils';

export type RunMCPToolQuery = {};

export type RunMCPToolBody = {
  url: string;
  toolName: string;
  headerAuth: StoreSecretValueType;
  params: Record<string, any>;
};

export type RunMCPToolResponse = any;

async function handler(
  req: ApiRequestProps<RunMCPToolBody, RunMCPToolQuery>,
  res: ApiResponseType<RunMCPToolResponse>
): Promise<RunMCPToolResponse> {
  const { url, toolName, headerAuth, params } = req.body;

  const mcpClient = new MCPClient({
    url,
    headerAuth: await getSecretValue({
      storeSecret: headerAuth,
      secretKey: process.env.AES256_SECRET_KEY
    })
  });

  return mcpClient.toolCall(toolName, params);
}

export default NextAPI(handler);
