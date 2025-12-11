import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';

export type UpdateFeedbackReadStatusBody = {
  appId: string;
  chatId: string;
  dataId: string;
  feedbackType: 'good' | 'bad';
  isRead: boolean;
};

async function handler(
  req: ApiRequestProps<UpdateFeedbackReadStatusBody>,
  _res: ApiResponseType<any>
): Promise<{ success: boolean }> {
  const { appId, chatId, dataId, feedbackType, isRead } = req.body;

  await authChatCrud({
    req,
    authToken: true,
    appId,
    chatId
  });

  // Determine which field to update based on feedback type
  const updateField = feedbackType === 'good' ? 'adminGoodFeedbackRead' : 'adminBadFeedbackRead';

  await MongoChatItem.updateOne(
    {
      appId,
      chatId,
      dataId,
      obj: ChatRoleEnum.AI
    },
    {
      $set: {
        [updateField]: isRead
      }
    }
  );

  return { success: true };
}

export default NextAPI(handler);
