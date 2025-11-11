import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { AUTH_TOKEN } from '@/service/auth';
import { refreshToolList } from '@/service/tool/data';

export type AdminRefreshQuery = {};
export type AdminRefreshBody = {};
export type AdminRefreshResponse = {};

async function handler(
  req: ApiRequestProps<AdminRefreshBody, AdminRefreshQuery>,
  res: ApiResponseType<any>
): Promise<AdminRefreshResponse> {
  if (req.headers['authorization'] === AUTH_TOKEN) {
    await refreshToolList();
    return {
      message: 'ok'
    };
  }
  res.status(401);
  return Promise.reject('Unauthorized');
}
export default NextAPI(handler);
