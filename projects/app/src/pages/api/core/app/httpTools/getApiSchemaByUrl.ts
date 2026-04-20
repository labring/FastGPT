import { loadOpenAPISchemaFromUrl } from '@fastgpt/global/common/string/swagger';
import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { isInternalAddress } from '@fastgpt/service/common/system/utils';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import {
  GetApiSchemaByUrlBodySchema,
  type GetApiSchemaByUrlBodyType,
  type GetApiSchemaByUrlResponseType
} from '@fastgpt/global/openapi/core/app/httpTools/api';

async function handler(
  req: ApiRequestProps<GetApiSchemaByUrlBodyType>,
  res: ApiResponseType
): Promise<GetApiSchemaByUrlResponseType> {
  const { url } = GetApiSchemaByUrlBodySchema.parse(req.body);

  await authCert({ req, authToken: true });

  if (await isInternalAddress(url)) {
    return Promise.reject('Invalid url');
  }

  return await loadOpenAPISchemaFromUrl(url);
}

export default NextAPI(handler);
