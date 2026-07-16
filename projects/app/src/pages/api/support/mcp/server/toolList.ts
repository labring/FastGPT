import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/types';
import { NextAPI } from '@/service/middleware/entry';
import { type Tool } from '@modelcontextprotocol/sdk/types.js';
import { getMcpServerTools } from '@/service/support/mcp/utils';

export type listToolsQuery = { key: string };

export type listToolsBody = Record<string, never>;

async function handler(
  req: ApiRequestProps<listToolsBody, listToolsQuery>,
  _res: ApiResponseType<any>
): Promise<Tool[]> {
  const { key } = req.query;

  return getMcpServerTools(key);
}

export default NextAPI(handler);
