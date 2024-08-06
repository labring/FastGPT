import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { POST } from '@fastgpt/service/common/api/plusRequest';
export type OutLinkFeishuQuery = any;
export type OutLinkFeishuBody = any;
export type OutLinkFeishuResponse = {};

async function handler(
  req: ApiRequestProps<OutLinkFeishuBody, OutLinkFeishuQuery>,
  _res: ApiResponseType<any>
): Promise<OutLinkFeishuResponse> {
  // send to pro
  const { token } = req.query;
  console.debug('token', token);
  return POST(`support/outLink/feishu/${token}`, req.body);
}
export default NextAPI(handler);
