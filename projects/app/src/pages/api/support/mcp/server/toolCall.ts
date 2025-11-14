import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { type toolCallProps } from '@/service/support/mcp/type';
import { callMcpServerTool } from '@/service/support/mcp/utils';

export type toolCallQuery = {};

export type toolCallBody = toolCallProps;

export type toolCallResponse = {};

async function handler(
  req: ApiRequestProps<toolCallBody, toolCallQuery>,
  res: ApiResponseType<any>
): Promise<toolCallResponse> {
  return callMcpServerTool(req.body);
}

export default NextAPI(handler);
