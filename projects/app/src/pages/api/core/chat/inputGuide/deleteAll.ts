import type { NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { MongoChatInputGuide } from '@fastgpt/service/core/chat/inputGuide/schema';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import {
  DeleteAllChatInputGuideBodySchema,
  DeleteAllChatInputGuideResponseSchema,
  type DeleteAllChatInputGuideResponseType
} from '@fastgpt/global/openapi/core/chat/inputGuide/api';

async function handler(
  req: ApiRequestProps,
  _res: NextApiResponse
): Promise<DeleteAllChatInputGuideResponseType> {
  const { appId } = DeleteAllChatInputGuideBodySchema.parse(req.body);
  await authApp({ req, appId, authToken: true, per: WritePermissionVal });

  await MongoChatInputGuide.deleteMany({
    appId
  });

  return DeleteAllChatInputGuideResponseSchema.parse({});
}

export default NextAPI(handler);
