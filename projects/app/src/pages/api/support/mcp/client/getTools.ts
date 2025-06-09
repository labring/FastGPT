import { NextAPI } from '@/service/middleware/entry';
import { type McpToolConfigType } from '@fastgpt/global/core/app/type';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { MCPClient } from '@fastgpt/service/core/app/mcp';
import { type StoreHeaderAuthValueType } from '@fastgpt/global/common/teamSecret/type';
import { formatHeaderAuth } from '@fastgpt/service/core/app/utils';

export type getMCPToolsQuery = {};

export type getMCPToolsBody = { url: string; headerAuth: StoreHeaderAuthValueType };

export type getMCPToolsResponse = McpToolConfigType[];

async function handler(
  req: ApiRequestProps<getMCPToolsBody, getMCPToolsQuery>,
  res: ApiResponseType<getMCPToolsResponse[]>
): Promise<getMCPToolsResponse> {
  const { url, headerAuth } = req.body;
  const formattedHeaderAuth = await formatHeaderAuth(headerAuth);

  const mcpClient = new MCPClient({ url, headerAuth: formattedHeaderAuth });

  return mcpClient.getTools();
}

export default NextAPI(handler);
