import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { checkPsw } from '@/service/support/user/account/check';
import { authCert } from '@fastgpt/service/support/permission/auth/common';

export type getTimeQuery = {
  updateTime: Date;
};

export type getTimeBody = {};

export type getTimeResponse = boolean;

async function handler(
  req: ApiRequestProps<getTimeBody, getTimeQuery>,
  res: ApiResponseType<getTimeResponse>
): Promise<getTimeResponse> {
  await authCert({ req, authToken: true });
  const updateTime = req.query.updateTime;
  return checkPsw({ updateTime });
}

export default NextAPI(handler);
