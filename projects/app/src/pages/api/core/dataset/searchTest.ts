import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/next/type';
import type { NextApiResponse } from 'next';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { parseHeaderCert } from '@fastgpt/service/support/permission/auth/common';
import {
  SearchDatasetTestBodySchema,
  SearchDatasetTestResponseSchema,
  type SearchDatasetTestResponse
} from '@fastgpt/global/openapi/core/dataset/api';
import { searchDatasetTestForApi } from '@/service/core/dataset/searchTest';

/** 保留单知识库搜索测试协议；执行链路与多知识库搜索共用同一个应用服务。 */
export async function handler(
  req: ApiRequestProps,
  res?: NextApiResponse
): Promise<SearchDatasetTestResponse> {
  const { body } = parseApiInput({ req, bodySchema: SearchDatasetTestBodySchema });
  const auth = await parseHeaderCert({ req, authToken: true, authApiKey: true });
  return SearchDatasetTestResponseSchema.parse(
    await searchDatasetTestForApi({
      params: body,
      auth,
      onRateLimit: ({ limit, remaining, resetAt }) => {
        // 兼容旧接口的响应头；限流策略仍由应用服务执行。
        if (res && limit !== undefined && remaining !== undefined && resetAt !== undefined) {
          res.setHeader('X-RateLimit-Limit', limit);
          res.setHeader('X-RateLimit-Remaining', remaining);
          res.setHeader('X-RateLimit-Reset', resetAt);
        }
      }
    })
  );
}

export default NextAPI(handler);
