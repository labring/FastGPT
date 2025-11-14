import type { NextApiResponse } from 'next';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { type UpdateChatFeedbackProps } from '@fastgpt/global/core/chat/api';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { MongoAppChatLog } from '@fastgpt/service/core/app/logs/chatLogsSchema';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';

async function handler(req: ApiRequestProps<UpdateChatFeedbackProps>, res: NextApiResponse) {
  const { appId, chatId, dataId, userBadFeedback, userGoodFeedback } = req.body;

  if (!chatId || !dataId) {
    return Promise.reject('chatId or dataId is empty');
  }

  const { teamId } = await authChatCrud({
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

  const goodFeedbackDelta = (() => {
    if (!userGoodFeedback && chatItem.userGoodFeedback) {
      return -1;
    } else if (userGoodFeedback && !chatItem.userGoodFeedback) {
      return 1;
    }
    return 0;
  })();

  const badFeedbackDelta = (() => {
    if (!userBadFeedback && chatItem.userBadFeedback) {
      return -1;
    } else if (userBadFeedback && !chatItem.userBadFeedback) {
      return 1;
    }
    return 0;
  })();

  await MongoAppChatLog.findOneAndUpdate(
    {
      teamId,
      appId,
      chatId
    },
    {
      $inc: {
        goodFeedbackCount: goodFeedbackDelta,
        badFeedbackCount: badFeedbackDelta
      }
    },
    {
      sort: { createTime: -1 }
    }
  );
}

export default NextAPI(handler);
