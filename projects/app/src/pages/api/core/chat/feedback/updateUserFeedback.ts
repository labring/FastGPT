import type { NextApiResponse } from 'next';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { type UpdateChatFeedbackProps } from '@fastgpt/global/core/chat/api';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { MongoAppChatLog } from '@fastgpt/service/core/app/logs/chatLogsSchema';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';

/* 初始化我的聊天框，需要身份验证 */
async function handler(req: ApiRequestProps<UpdateChatFeedbackProps>, res: NextApiResponse) {
  const { appId, chatId, dataId, userBadFeedback, userGoodFeedback } = req.body;

  if (!chatId || !dataId) {
    return Promise.reject('chatId or dataId is empty');
  }

  await authChatCrud({
    req,
    authToken: true,
    authApiKey: true,
    ...req.body
  });

  const chatItem = await MongoChatItem.findOne({ appId, chatId, dataId });
  if (!chatItem) {
    return Promise.reject('Chat item not found');
  }

  await MongoChatItem.updateOne(
    { appId, chatId, dataId },
    {
      $unset: {
        ...(userBadFeedback === undefined && { userBadFeedback: '' }),
        ...(userGoodFeedback === undefined && { userGoodFeedback: '' })
      },
      $set: {
        ...(userBadFeedback !== undefined && { userBadFeedback }),
        ...(userGoodFeedback !== undefined && { userGoodFeedback })
      }
    }
  );

  if (chatItem.obj !== ChatRoleEnum.AI) return;
  const messageTime = chatItem.time || chatItem._id.getTimestamp();

  const getFeedbackDelta = (() => {
    const goodFeedbackDelta =
      !userGoodFeedback && chatItem.userGoodFeedback
        ? -1
        : userGoodFeedback && !chatItem.userGoodFeedback
          ? 1
          : 0;

    const badFeedbackDelta =
      !userBadFeedback && chatItem.userBadFeedback
        ? -1
        : userBadFeedback && !chatItem.userBadFeedback
          ? 1
          : 0;

    return { goodFeedbackDelta, badFeedbackDelta };
  })();

  await MongoAppChatLog.findOneAndUpdate(
    {
      appId,
      chatId,
      createTime: { $lte: messageTime }
    },
    {
      $inc: {
        goodFeedbackCount: getFeedbackDelta.goodFeedbackDelta,
        badFeedbackCount: getFeedbackDelta.badFeedbackDelta
      }
    },
    {
      sort: { createTime: -1 }
    }
  );
}

export default NextAPI(handler);
