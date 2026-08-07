import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { type Tool } from '@modelcontextprotocol/sdk/types.js';
import { getMcpServerTools } from '@/service/support/mcp/utils';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { McpToolListQuerySchema } from '@fastgpt/global/openapi/support/mcpServer/api';

export type listToolsQuery = { key: string };

export type listToolsBody = Record<string, never>;

async function handler(
  req: ApiRequestProps<listToolsBody, listToolsQuery>,
  _res: ApiResponseType<any>
): Promise<Tool[]> {
  const { key } = parseApiInput({ req, querySchema: McpToolListQuerySchema }).query;

  return getMcpServerTools(key);
}

export default NextAPI(handler);
