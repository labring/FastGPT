import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';

export type UpdateFeedbackReadStatusBody = {
  appId: string;
  chatId: string;
  dataId: string;
  isRead: boolean;
};

async function handler(
  req: ApiRequestProps<UpdateFeedbackReadStatusBody>,
  _res: ApiResponseType<any>
): Promise<{ success: boolean }> {
  const { appId, chatId, dataId, isRead } = req.body;

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

  return { success: true };
}

export default NextAPI(handler);
