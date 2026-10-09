import type { NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { MongoChatInputGuide } from '@fastgpt/service/core/chat/inputGuide/schema';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import {
  CountChatInputGuideTotalQuerySchema,
  CountChatInputGuideTotalResponseSchema,
  type CountChatInputGuideTotalResponseType
} from '@fastgpt/global/openapi/core/chat/inputGuide/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

/** 计数与引导词列表使用相同的应用读权限，未授权时不查询引导词数据。 */
async function handler(
  req: ApiRequestProps,
  _res: NextApiResponse
): Promise<CountChatInputGuideTotalResponseType> {
  const { appId } = parseApiInput({
    req,
    querySchema: CountChatInputGuideTotalQuerySchema
  }).query;

  await authApp({ req, appId, authToken: true, per: ReadPermissionVal });

  return CountChatInputGuideTotalResponseSchema.parse({
    total: await MongoChatInputGuide.countDocuments({ appId })
  });
}

export default NextAPI(handler);
