import type { NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { MongoChatInputGuide } from '@fastgpt/service/core/chat/inputGuide/schema';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import {
  CountChatInputGuideTotalQuerySchema,
  CountChatInputGuideTotalResponseSchema,
  type CountChatInputGuideTotalResponseType
} from '@fastgpt/global/openapi/core/chat/inputGuide/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

async function handler(
  req: ApiRequestProps,
  _res: NextApiResponse
): Promise<CountChatInputGuideTotalResponseType> {
  await authCert({ req, authToken: true });

  const { appId } = parseApiInput({
    req,
    querySchema: CountChatInputGuideTotalQuerySchema
  }).query;

  return CountChatInputGuideTotalResponseSchema.parse({
    total: await MongoChatInputGuide.countDocuments({ appId })
  });
}

export default NextAPI(handler);
