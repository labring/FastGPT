import type { NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { MongoChatInputGuide } from '@fastgpt/service/core/chat/inputGuide/schema';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import {
  CountChatInputGuideTotalQuerySchema,
  CountChatInputGuideTotalResponseSchema,
  type CountChatInputGuideTotalResponseType
} from '@fastgpt/global/openapi/core/chat/inputGuide/api';

async function handler(
  req: ApiRequestProps,
  _res: NextApiResponse
): Promise<CountChatInputGuideTotalResponseType> {
  await authCert({ req, authToken: true });

  const { appId } = CountChatInputGuideTotalQuerySchema.parse(req.query);

  return CountChatInputGuideTotalResponseSchema.parse({
    total: await MongoChatInputGuide.countDocuments({ appId })
  });
}

export default NextAPI(handler);
