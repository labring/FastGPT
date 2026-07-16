import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/next/types';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { MongoChatInputGuide } from '@fastgpt/service/core/chat/inputGuide/schema';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import {
  DeleteAllChatInputGuideBodySchema,
  DeleteAllChatInputGuideResponseSchema,
  type DeleteAllChatInputGuideResponseType
} from '@fastgpt/global/openapi/core/chat/inputGuide/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

async function handler(req: ApiRequestProps): Promise<DeleteAllChatInputGuideResponseType> {
  const { appId } = parseApiInput({
    req,
    bodySchema: DeleteAllChatInputGuideBodySchema
  }).body;
  await authApp({ req, appId, authToken: true, per: WritePermissionVal });

  await MongoChatInputGuide.deleteMany({
    appId
  });

  return DeleteAllChatInputGuideResponseSchema.parse(undefined);
}

export default NextAPI(handler);
