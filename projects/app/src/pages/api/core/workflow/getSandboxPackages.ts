import { NextAPI } from '@/service/middleware/entry';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { codeSandbox } from '@fastgpt/service/thirdProvider/codeSandbox';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';

export type ResponseType = {};

async function handler(
  req: ApiRequestProps,
  res: ApiResponseType<ResponseType>
): Promise<ResponseType> {
  await authCert({ req, authToken: true });
  return codeSandbox.getPackages();
}

export default NextAPI(handler);
