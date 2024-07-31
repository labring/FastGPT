import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { getUserDetail } from '@fastgpt/service/support/user/controller';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
export type TokenLoginQuery = {};
export type TokenLoginBody = {};
export type TokenLoginResponse = {};
async function handler(
  req: ApiRequestProps<TokenLoginBody, TokenLoginQuery>,
  _res: ApiResponseType<any>
): Promise<TokenLoginResponse> {
  const { tmbId } = await authCert({ req, authToken: true });
  return getUserDetail({ tmbId });
}
export default NextAPI(handler);
