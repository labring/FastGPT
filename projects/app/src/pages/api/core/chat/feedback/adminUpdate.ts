import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import {
  AdminUpdateFeedbackBodySchema,
  AdminUpdateFeedbackResponseSchema,
  type AdminUpdateFeedbackResponseType
} from '@fastgpt/global/openapi/core/chat/feedback/api';

async function handler(
  req: ApiRequestProps,
  _res: ApiResponseType<any>
): Promise<AdminUpdateFeedbackResponseType> {
  const { appId, chatId, dataId, datasetId, feedbackDataId, q, a } =
    AdminUpdateFeedbackBodySchema.parse(req.body);

  await authChatCrud({
    req,
    authToken: true,
    authApiKey: true,
    appId,
    chatId
  });

  await MongoChatItem.updateOne(
    {
      appId,
      chatId,
      dataId
    },
    {
      adminFeedback: {
        datasetId,
        dataId: feedbackDataId,
        q,
        a
      }
    }
  );

  return AdminUpdateFeedbackResponseSchema.parse({});
}

export default NextAPI(handler);
