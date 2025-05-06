import { NextAPI } from '@/service/middleware/entry';
import { type ToolType } from '@fastgpt/global/core/app/type';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { MCPClient } from '@fastgpt/service/core/app/mcp';

export type getMCPToolsQuery = {};

export type getMCPToolsBody = { url: string };

export type getMCPToolsResponse = ToolType[];

async function handler(
  req: ApiRequestProps<getMCPToolsBody, getMCPToolsQuery>,
  res: ApiResponseType<getMCPToolsResponse[]>
): Promise<getMCPToolsResponse> {
  const { url } = req.body;

  const mcpClient = new MCPClient({ url });

  return mcpClient.getTools();
}

export default NextAPI(handler);
