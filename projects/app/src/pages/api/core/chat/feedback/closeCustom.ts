import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import {
  CloseCustomFeedbackBodySchema,
  type CloseCustomFeedbackBodyType,
  CloseCustomFeedbackResponseSchema,
  type CloseCustomFeedbackResponseType
} from '@fastgpt/global/openapi/core/chat/feedback/api';

async function handler(
  req: ApiRequestProps,
  _res: ApiResponseType<any>
): Promise<CloseCustomFeedbackResponseType> {
  const { appId, chatId, dataId, index } = CloseCustomFeedbackBodySchema.parse(req.body);

  await authChatCrud({
    req,
    authToken: true,
    authApiKey: true,
    appId,
    chatId
  });
  await authCert({ req, authToken: true });

  await mongoSessionRun(async (session) => {
    await MongoChatItem.findOneAndUpdate(
      { appId, chatId, dataId },
      { $unset: { [`customFeedbacks.${index}`]: 1 } },
      {
        session
      }
    );
    await MongoChatItem.findOneAndUpdate(
      { appId, chatId, dataId },
      { $pull: { customFeedbacks: null } },
      {
        session
      }
    );
  });

  return CloseCustomFeedbackResponseSchema.parse({});
}

export default NextAPI(handler);
