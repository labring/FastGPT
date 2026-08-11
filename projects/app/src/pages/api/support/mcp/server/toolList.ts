import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { getMcpServerTools } from '@/service/support/mcp/utils';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  McpServerToolListQuerySchema,
  McpServerToolListResponseSchema,
  type McpServerToolListResponse
} from '@fastgpt/global/openapi/support/mcpServer/api';

async function handler(
  req: ApiRequestProps,
  _res: ApiResponseType
): Promise<McpServerToolListResponse> {
  const { key } = parseApiInput({ req, querySchema: McpServerToolListQuerySchema }).query;
  const tools = await getMcpServerTools(key);

  return McpServerToolListResponseSchema.parse(tools);
}

export default NextAPI(handler);
