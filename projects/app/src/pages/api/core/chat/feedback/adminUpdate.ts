import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import type { AdminUpdateFeedbackParams } from '@/global/core/chat/api.d';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { authChatCrud } from '@/service/support/permission/auth/chat';

/* 初始化我的聊天框，需要身份验证 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    const { appId, chatId, dataId, datasetId, feedbackDataId, q, a } =
      req.body as AdminUpdateFeedbackParams;

    if (!dataId || !datasetId || !feedbackDataId || !q) {
      throw new Error('missing parameter');
    }

    await authChatCrud({
      req,
      authToken: true,
      authApiKey: true,
      appId,
      chatId
    });

    await MongoChatItem.findOneAndUpdate(
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

    jsonRes(res);
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
