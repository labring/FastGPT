import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import {
  UpdateFeedbackReadStatusBodySchema,
  type UpdateFeedbackReadStatusBodyType,
  UpdateFeedbackReadStatusResponseSchema,
  type UpdateFeedbackReadStatusResponseType
} from '@fastgpt/global/openapi/core/chat/feedback/api';

async function handler(
  req: ApiRequestProps,
  _res: ApiResponseType<any>
): Promise<UpdateFeedbackReadStatusResponseType> {
  const { appId, chatId, dataId, isRead } = UpdateFeedbackReadStatusBodySchema.parse(req.body);

  await authChatCrud({
    req,
    authToken: true,
    appId,
    chatId
  });

  await MongoChatItem.updateOne(
    {
      appId,
      chatId,
      dataId,
      obj: ChatRoleEnum.AI
    },
    {
      $set: {
        isFeedbackRead: isRead
      }
    }
  );

  return UpdateFeedbackReadStatusResponseSchema.parse({ success: true });
}

export default NextAPI(handler);
