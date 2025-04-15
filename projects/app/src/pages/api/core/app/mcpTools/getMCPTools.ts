import { NextAPI } from '@/service/middleware/entry';
import { ToolType } from '@fastgpt/global/core/app/type';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

export type getMCPToolsQuery = {};

export type getMCPToolsBody = { url: string };

export type getMCPToolsResponse = ToolType[];

async function handler(
  req: ApiRequestProps<getMCPToolsBody, getMCPToolsQuery>,
  res: ApiResponseType<getMCPToolsResponse[]>
): Promise<getMCPToolsResponse> {
  const { url } = req.body;

  const client = new Client({
    name: 'FastGPT-MCP-client',
    version: '1.0.0'
  });

  const transport = new SSEClientTransport(new URL(url));
  await client.connect(transport);

  const { tools } = await client.listTools();

  await client.close();

  if (!tools) {
    return [];
  }

  return tools as ToolType[];
}

export default NextAPI(handler);
