import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { type toolCallProps } from '@/service/support/mcp/type';
import { callMcpServerTool } from '@/service/support/mcp/utils';

export type toolCallQuery = Record<string, never>;

export type toolCallBody = toolCallProps;

export type toolCallResponse = string;

async function handler(
  req: ApiRequestProps<toolCallBody, toolCallQuery>,
  _res: ApiResponseType<any>
): Promise<toolCallResponse> {
  return callMcpServerTool(req.body);
}

export default NextAPI(handler);
