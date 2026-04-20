import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { runHTTPTool } from '@fastgpt/service/core/app/http';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import {
  RunHttpToolBodySchema,
  type RunHttpToolBodyType,
  type RunHttpToolResponseType
} from '@fastgpt/global/openapi/core/app/httpTools/api';

async function handler(
  req: ApiRequestProps<RunHttpToolBodyType>,
  res: ApiResponseType
): Promise<RunHttpToolResponseType> {
  await authCert({ req, authToken: true });

  const {
    params,
    baseUrl,
    toolPath,
    method = 'POST',
    customHeaders,
    headerSecret,
    staticParams,
    staticHeaders,
    staticBody
  } = RunHttpToolBodySchema.parse(req.body);

  return runHTTPTool({
    baseUrl,
    toolPath,
    method,
    params,
    headerSecret,
    customHeaders,
    staticParams,
    staticHeaders,
    staticBody
  });
}

export default NextAPI(handler);
