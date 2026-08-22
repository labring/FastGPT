import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { callMcpServerTool } from '@/service/support/mcp/utils';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  McpServerToolCallBodySchema,
  McpServerToolCallResponseSchema,
  type McpServerToolCallResponse
} from '@fastgpt/global/openapi/support/mcpServer/api';
import { getMcpAuthProxyFromHeaders } from '@/service/support/mcp/auth';

async function handler(
  req: ApiRequestProps,
  _res: ApiResponseType
): Promise<McpServerToolCallResponse> {
  const { body } = parseApiInput({ req, bodySchema: McpServerToolCallBodySchema });
  const result = await callMcpServerTool({
    ...body,
    authProxy: getMcpAuthProxyFromHeaders(req.headers)
  });

  return McpServerToolCallResponseSchema.parse(result);
}

export default NextAPI(handler);
