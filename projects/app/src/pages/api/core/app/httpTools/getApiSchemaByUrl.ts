import {
  bundleOpenAPISchema,
  parseOpenAPISchemaString
} from '@fastgpt/global/common/string/swagger';
import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { axios } from '@fastgpt/service/common/api/axios';
import { checkUrlSafety } from '@fastgpt/service/common/system/utils';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  GetApiSchemaByUrlBodySchema,
  GetApiSchemaByUrlResponseSchema,
  type GetApiSchemaByUrlBodyType,
  type GetApiSchemaByUrlResponseType
} from '@fastgpt/global/openapi/core/app/httpTools/api';

export async function handler(
  req: ApiRequestProps<GetApiSchemaByUrlBodyType>
): Promise<GetApiSchemaByUrlResponseType> {
  const {
    body: { url }
  } = parseApiInput({
    req,
    bodySchema: GetApiSchemaByUrlBodySchema
  });

  await authCert({ req, authToken: true });

  await checkUrlSafety(url, 'OpenAPI Schema URL');

  const { data } = await axios.get<string>(url, {
    responseType: 'text',
    maxRedirects: 0,
    timeout: 30000,
    transformResponse: (value) => value
  });

  return GetApiSchemaByUrlResponseSchema.parse(
    await bundleOpenAPISchema(parseOpenAPISchemaString(data))
  );
}

export default NextAPI(handler);
