import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { type StoreSecretValueType } from '@fastgpt/global/common/secret/type';
import type { RunHTTPToolResult } from '@fastgpt/service/core/app/http';
import { runHTTPTool } from '@fastgpt/service/core/app/http';

export type RunHTTPToolQuery = {};

export type RunHTTPToolBody = {
  params: Record<string, any>;
  baseUrl: string;
  toolPath: string;
  method: string;
  customHeaders?: Record<string, string>;
  headerSecret?: StoreSecretValueType;
};

export type RunHTTPToolResponse = RunHTTPToolResult;

async function handler(
  req: ApiRequestProps<RunHTTPToolBody, RunHTTPToolQuery>,
  res: ApiResponseType<RunHTTPToolResponse>
): Promise<RunHTTPToolResponse> {
  const { params, baseUrl, toolPath, method = 'POST', customHeaders, headerSecret } = req.body;

  return runHTTPTool({
    baseUrl,
    toolPath,
    method,
    params,
    headerSecret,
    customHeaders
  });
}

export default NextAPI(handler);
