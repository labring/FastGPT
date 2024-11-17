import type { NextApiResponse } from 'next';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { UpdateChatFeedbackProps } from '@fastgpt/global/core/chat/api';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import { NextAPI } from '@/service/middleware/entry';
import { ApiRequestProps } from '@fastgpt/service/type/next';

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

  await MongoChatItem.findOneAndUpdate(
    {
      appId,
      chatId,
      dataId
    },
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
}

export default NextAPI(handler);
