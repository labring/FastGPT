import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { HTTPClient } from '@fastgpt/service/core/app/http';
import { type StoreSecretValueType } from '@fastgpt/global/common/secret/type';
import { getSecretValue } from '@fastgpt/service/common/secret/utils';

export type RunHTTPToolQuery = {};

export type RunHTTPToolBody = {
  url: string;
  toolName: string;
  headerSecret: StoreSecretValueType;
  params: Record<string, any>;
  toolPath?: string;
  method?: string;
};

export type RunHTTPToolResponse = any;

async function handler(
  req: ApiRequestProps<RunHTTPToolBody, RunHTTPToolQuery>,
  res: ApiResponseType<RunHTTPToolResponse>
): Promise<RunHTTPToolResponse> {
  const { url, toolName, headerSecret, params, toolPath, method } = req.body;
  console.log('url', url);
  console.log('toolName', toolName);
  console.log('toolPath', toolPath);
  console.log('method', method);
  console.log('headerSecret', headerSecret);
  console.log('params', params);
  const httpClient = new HTTPClient({
    url,
    headers: getSecretValue({
      storeSecret: headerSecret
    })
  });

  return httpClient.toolCallSimple(toolName, params, toolPath, method);
}

export default NextAPI(handler);
