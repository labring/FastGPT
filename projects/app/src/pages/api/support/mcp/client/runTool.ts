import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { MCPClient } from '@fastgpt/service/core/app/mcp';
import { type StoreHeaderAuthValueType } from '@fastgpt/global/common/teamSecret/type';
import { formatHeaderAuth } from '@fastgpt/service/core/app/utils';

export type RunMCPToolQuery = {};

export type RunMCPToolBody = {
  url: string;
  toolName: string;
  headerAuth: StoreHeaderAuthValueType;
  params: Record<string, any>;
};

export type RunMCPToolResponse = any;

async function handler(
  req: ApiRequestProps<RunMCPToolBody, RunMCPToolQuery>,
  res: ApiResponseType<RunMCPToolResponse>
): Promise<RunMCPToolResponse> {
  const { url, toolName, headerAuth, params } = req.body;
  const formattedHeaderAuth = await formatHeaderAuth(headerAuth);

  const mcpClient = new MCPClient({ url, headerAuth: formattedHeaderAuth });

  return mcpClient.toolCall(toolName, params);
}

export default NextAPI(handler);
