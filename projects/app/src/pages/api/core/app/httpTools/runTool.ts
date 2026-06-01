import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { runHTTPTool } from '@fastgpt/service/core/app/http';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  RunHttpToolBodySchema,
  RunHttpToolResponseSchema,
  type RunHttpToolBodyType,
  type RunHttpToolResponseType
} from '@fastgpt/global/openapi/core/app/httpTools/api';

async function handler(
  req: ApiRequestProps<RunHttpToolBodyType>
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
  } = parseApiInput({
    req,
    bodySchema: RunHttpToolBodySchema
  }).body;

  return RunHttpToolResponseSchema.parse(
    await runHTTPTool({
      baseUrl,
      toolPath,
      method,
      params,
      headerSecret,
      customHeaders: customHeaders
        ? Object.fromEntries(
            Object.entries(customHeaders).map(([key, value]) => [key, String(value)])
          )
        : undefined,
      staticParams,
      staticHeaders,
      staticBody
    })
  );
}

export default NextAPI(handler);
