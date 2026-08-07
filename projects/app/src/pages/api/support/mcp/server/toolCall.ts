import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { type toolCallProps } from '@/service/support/mcp/type';
import { callMcpServerTool } from '@/service/support/mcp/utils';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { McpToolCallBodySchema } from '@fastgpt/global/openapi/support/mcpServer/api';
import { getMcpAuthProxyFromHeaders } from '@/service/support/mcp/auth';

export type toolCallQuery = Record<string, never>;

export type toolCallBody = toolCallProps;

export type toolCallResponse = string;

async function handler(
  req: ApiRequestProps<toolCallBody, toolCallQuery>,
  _res: ApiResponseType<any>
): Promise<toolCallResponse> {
  const body = parseApiInput({ req, bodySchema: McpToolCallBodySchema }).body;
  return callMcpServerTool({
    ...body,
    authProxy: getMcpAuthProxyFromHeaders(req.headers)
  });
}

export default NextAPI(handler);
