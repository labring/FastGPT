import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import type {
  InvokeUserInfoBodyType,
  InvokeUserInfoQueryType,
  InvokeUserInfoResponseType
} from '@fastgpt/global/openapi/plugin/invoke';
import {
  InvokeUserInfoQuerySchema,
  InvokeUserInfoResponseSchema
} from '@fastgpt/global/openapi/plugin/invoke';
import { InvokeProcessor } from '@fastgpt/service/support/invoke/invoke';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

async function handler(
  req: ApiRequestProps<InvokeUserInfoBodyType, InvokeUserInfoQueryType>,
  _res: ApiResponseType<InvokeUserInfoResponseType>
): Promise<InvokeUserInfoResponseType> {
  parseApiInput({ req, querySchema: InvokeUserInfoQuerySchema });

  const token = req.headers.authorization?.split(' ')[1] || '';
  const userInfo = await InvokeProcessor.getInstanceFromToken(token).handleGetUserInfo();

  return InvokeUserInfoResponseSchema.parse(userInfo);
}

export default NextAPI(handler);
