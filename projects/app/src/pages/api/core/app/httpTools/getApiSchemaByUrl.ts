import { loadOpenAPISchemaFromUrl } from '@fastgpt/global/common/string/swagger';
import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { isInternalAddress } from '@fastgpt/service/common/system/utils';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  GetApiSchemaByUrlBodySchema,
  GetApiSchemaByUrlResponseSchema,
  type GetApiSchemaByUrlBodyType,
  type GetApiSchemaByUrlResponseType
} from '@fastgpt/global/openapi/core/app/httpTools/api';

async function handler(
  req: ApiRequestProps<GetApiSchemaByUrlBodyType>
): Promise<GetApiSchemaByUrlResponseType> {
  const {
    body: { url }
  } = parseApiInput({
    req,
    bodySchema: GetApiSchemaByUrlBodySchema
  });

  await authCert({ req, authToken: true });

  if (await isInternalAddress(url)) {
    return Promise.reject('Invalid url');
  }

  return GetApiSchemaByUrlResponseSchema.parse(await loadOpenAPISchemaFromUrl(url));
}

export default NextAPI(handler);
