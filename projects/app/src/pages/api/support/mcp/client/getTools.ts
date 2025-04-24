import { NextAPI } from '@/service/middleware/entry';
import { ToolType } from '@fastgpt/global/core/app/type';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import getMCPClient from '@fastgpt/service/core/app/mcp';

export type getMCPToolsQuery = {};

export type getMCPToolsBody = { url: string };

export type getMCPToolsResponse = ToolType[];

async function handler(
  req: ApiRequestProps<getMCPToolsBody, getMCPToolsQuery>,
  res: ApiResponseType<getMCPToolsResponse[]>
): Promise<getMCPToolsResponse> {
  const { url } = req.body;

  const mcpClient = getMCPClient({ url });

  try {
    const tools = await mcpClient.getTools();
    return tools;
  } catch (error) {
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
