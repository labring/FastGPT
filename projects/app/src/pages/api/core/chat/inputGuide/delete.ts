import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/next/types';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { MongoChatInputGuide } from '@fastgpt/service/core/chat/inputGuide/schema';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import {
  DeleteChatInputGuideBodySchema,
  DeleteChatInputGuideResponseSchema,
  type DeleteChatInputGuideResponseType
} from '@fastgpt/global/openapi/core/chat/inputGuide/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

async function handler(req: ApiRequestProps): Promise<DeleteChatInputGuideResponseType> {
  const { appId, dataIdList } = parseApiInput({
    req,
    bodySchema: DeleteChatInputGuideBodySchema
  }).body;
  await authApp({ req, appId, authToken: true, per: WritePermissionVal });

  await MongoChatInputGuide.deleteMany({
    _id: { $in: dataIdList },
    appId
  });

  return DeleteChatInputGuideResponseSchema.parse(undefined);
}

export default NextAPI(handler);
