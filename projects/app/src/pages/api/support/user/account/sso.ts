import { NextAPI } from '@/service/middleware/entry';
import { plusRequest } from '@fastgpt/service/common/api/plusRequest';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';

export type SSOQuery = any;
export type SSOBody = any;
export type SSOResponse = {};

async function handler(
  req: ApiRequestProps<SSOBody, SSOQuery>,
  _res: ApiResponseType<any>
): Promise<SSOResponse> {
  plusRequest({
    url: 'support/user/account/sso',
    data: req.body,
    params: req.query,
    headers: req.headers
  });
  return {};
}

export default NextAPI(handler);
