import { NextAPI } from '@/service/middleware/entry';
import type { McpToolConfigType } from '@fastgpt/global/core/app/tool/mcpTool/type';
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

  const result = await mcpClient.getTools();
  return result;
}

export default NextAPI(handler);
