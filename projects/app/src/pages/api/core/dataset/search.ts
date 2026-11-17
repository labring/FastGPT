import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { parseHeaderCert } from '@fastgpt/service/support/permission/auth/common';
import {
  SearchDatasetRequestBodySchema,
  SearchDatasetResponseSchema,
  type SearchDatasetResponse
} from '@fastgpt/global/openapi/core/dataset/search/api';
import { searchDatasetForApi } from '@/service/core/dataset/search';
import { i18nT } from '@fastgpt/global/common/i18n/utils';

/** HTTP 入口只负责契约和身份边界，业务编排由搜索应用服务完成。 */
export async function handler(req: ApiRequestProps): Promise<SearchDatasetResponse> {
  const { body } = parseApiInput({ req, bodySchema: SearchDatasetRequestBodySchema });
  const auth = await parseHeaderCert({ req, authApiKey: true, authToken: true });
  const { usageScene, ...params } = body;
  const result = await searchDatasetForApi({
    params,
    auth,
    usageAppName:
      usageScene === 'searchTest'
        ? i18nT('account_usage:search_test')
        : i18nT('account_usage:dataset_search')
  });
  return SearchDatasetResponseSchema.parse(result);
}

export default NextAPI(handler);
