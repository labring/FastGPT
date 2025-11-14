import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { type Tool } from '@modelcontextprotocol/sdk/types';
import { getMcpServerTools } from '@/service/support/mcp/utils';

export type listToolsQuery = { key: string };

export type listToolsBody = {};

export type listToolsResponse = {};

async function handler(
  req: ApiRequestProps<listToolsBody, listToolsQuery>,
  res: ApiResponseType<any>
): Promise<Tool[]> {
  const { key } = req.query;

  return getMcpServerTools(key);
}

export default NextAPI(handler);
