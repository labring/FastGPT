import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { MCPClient } from '@fastgpt/service/core/app/mcp';

export type RunMCPToolQuery = {};

export type RunMCPToolBody = {
  url: string;
  toolName: string;
  params: Record<string, any>;
};

export type RunMCPToolResponse = any;

async function handler(
  req: ApiRequestProps<RunMCPToolBody, RunMCPToolQuery>,
  res: ApiResponseType<RunMCPToolResponse>
): Promise<RunMCPToolResponse> {
  const { url, toolName, params } = req.body;

  const mcpClient = new MCPClient({ url });

  return mcpClient.toolCall(toolName, params);
}

export default NextAPI(handler);
