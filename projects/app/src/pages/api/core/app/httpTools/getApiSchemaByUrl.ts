import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { fetchOpenAPISchemaByUrl } from '@fastgpt/service/core/app/httpTool/schema';
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

  return GetApiSchemaByUrlResponseSchema.parse(await fetchOpenAPISchemaByUrl(url));
}

export default NextAPI(handler);
