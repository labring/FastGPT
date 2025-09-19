import { NextAPI } from '@/service/middleware/entry';
import { type HttpToolConfigType } from '@fastgpt/global/core/app/type';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { HTTPClient } from '@fastgpt/service/core/app/http';
import { type StoreSecretValueType } from '@fastgpt/global/common/secret/type';
import { getSecretValue } from '@fastgpt/service/common/secret/utils';

export type getHTTPToolsQuery = {};

export type getHTTPToolsBody = {
  url: string;
  headerSecret: StoreSecretValueType;
  customHeaders?: Record<string, string>;
};

export type getHTTPToolsResponse = HttpToolConfigType[];

async function handler(
  req: ApiRequestProps<getHTTPToolsBody, getHTTPToolsQuery>,
  res: ApiResponseType<getHTTPToolsResponse[]>
): Promise<getHTTPToolsResponse> {
  const { url, headerSecret, customHeaders } = req.body;

  const httpClient = new HTTPClient({
    url,
    headers: {
      ...(customHeaders || {}),
      // auth headers have higher priority
      ...getSecretValue({
        storeSecret: headerSecret
      })
    }
  });

  const result = await httpClient.getTools();
  return result;
}

export default NextAPI(handler);
