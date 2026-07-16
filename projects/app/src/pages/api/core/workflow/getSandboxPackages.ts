import { NextAPI } from '@/service/middleware/entry';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import {
  codeSandbox,
  type SanndboxPackagesResponse
} from '@fastgpt/service/thirdProvider/codeSandbox';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/types';

export type ResponseType = SanndboxPackagesResponse;

async function handler(
  req: ApiRequestProps,
  _res: ApiResponseType<ResponseType>
): Promise<ResponseType> {
  await authCert({ req, authToken: true });
  return codeSandbox.getPackages();
}

export default NextAPI(handler);
