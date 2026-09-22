import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import type { InvokeUserInfoResponseType } from '@fastgpt/global/openapi/plugin/invoke';
import { InvokeUserInfoResponseSchema } from '@fastgpt/global/openapi/plugin/invoke';
import { InvokeProcessor } from '@fastgpt/service/support/invoke/invoke';

async function handler(
  req: ApiRequestProps,
  _res: ApiResponseType<InvokeUserInfoResponseType>
): Promise<InvokeUserInfoResponseType> {
  const token = req.headers.authorization?.split(' ')[1] || '';
  const userInfo = await InvokeProcessor.getInstanceFromToken(token).handleGetUserInfo();

  return InvokeUserInfoResponseSchema.parse(userInfo);
}

export default NextAPI(handler);
