import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import type {
  InvokeUserInfoBodyType,
  InvokeUserInfoQueryType,
  InvokeUserInfoResponseType
} from '@fastgpt/global/openapi/plugin/invoke';
import { InvokeProcessor } from '@fastgpt/service/support/invoke/invoke';

async function handler(
  req: ApiRequestProps<InvokeUserInfoBodyType, InvokeUserInfoQueryType>,
  res: ApiResponseType<InvokeUserInfoResponseType>
): Promise<InvokeUserInfoResponseType> {
  // const body = InvokeUserInfoBodySchema.parse(req.body);
  // const query = InvokeUserInfoQuerySchema.parse(req.query);

  const token = req.headers.authorization?.split(' ')[1] || '';
  return InvokeProcessor.getInstanceFromToken(token).handleGetUserInfo();
}

export default NextAPI(handler);
