import { NextAPI } from '@/service/middleware/entry';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { codeSandbox } from '@fastgpt/service/thirdProvider/codeSandbox';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import {
  GetSandboxPackagesQuerySchema,
  GetSandboxPackagesResponseSchema,
  type GetSandboxPackagesQuery,
  type GetSandboxPackagesResponse
} from '@fastgpt/global/openapi/core/workflow/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

export type ResponseType = GetSandboxPackagesResponse;

async function handler(
  req: ApiRequestProps<Record<string, never>, GetSandboxPackagesQuery>,
  _res: ApiResponseType<ResponseType>
): Promise<ResponseType> {
  parseApiInput({ req, querySchema: GetSandboxPackagesQuerySchema });
  await authCert({ req, authToken: true });
  return GetSandboxPackagesResponseSchema.parse(await codeSandbox.getPackages());
}

export default NextAPI(handler);
