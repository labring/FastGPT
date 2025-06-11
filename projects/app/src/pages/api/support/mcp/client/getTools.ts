import { NextAPI } from '@/service/middleware/entry';
import { type McpToolConfigType } from '@fastgpt/global/core/app/type';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { MCPClient } from '@fastgpt/service/core/app/mcp';
import { type StoreSecretValueType } from '@fastgpt/global/common/secret/type';
import { getSecretValue } from '@fastgpt/service/common/secret/utils';

export type getMCPToolsQuery = {};

export type getMCPToolsBody = { url: string; headerSecret: StoreSecretValueType };

export type getMCPToolsResponse = McpToolConfigType[];

async function handler(
  req: ApiRequestProps<getMCPToolsBody, getMCPToolsQuery>,
  res: ApiResponseType<getMCPToolsResponse[]>
): Promise<getMCPToolsResponse> {
  const { url, headerSecret } = req.body;

  const mcpClient = new MCPClient({
    url,
    headers: getSecretValue({
      storeSecret: headerSecret
    })
  });

  return mcpClient.getTools();
}

export default NextAPI(handler);
