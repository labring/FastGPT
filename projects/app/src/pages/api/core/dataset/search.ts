import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { parseHeaderCert } from '@fastgpt/service/support/permission/auth/common';
import {
  SearchDatasetBodySchema,
  SearchDatasetResponseSchema,
  type SearchDatasetResponse
} from '@fastgpt/global/openapi/core/dataset/search/api';
import { searchDatasetForApi } from '@/service/core/dataset/search';

/** HTTP 入口只负责契约和身份边界，业务编排由搜索应用服务完成。 */
export async function handler(req: ApiRequestProps): Promise<SearchDatasetResponse> {
  const { body } = parseApiInput({ req, bodySchema: SearchDatasetBodySchema });
  const auth = await parseHeaderCert({ req, authApiKey: true, authToken: true });
  const result = await searchDatasetForApi({ params: body, auth });
  return SearchDatasetResponseSchema.parse(result);
}

export default NextAPI(handler);
