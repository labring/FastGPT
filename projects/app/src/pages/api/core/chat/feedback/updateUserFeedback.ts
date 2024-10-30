import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { UpdateChatFeedbackProps } from '@fastgpt/global/core/chat/api';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { NextAPI } from '@/service/middleware/entry';

/* 初始化我的聊天框，需要身份验证 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  const {
    appId,
    chatId,
    dataId,
    shareId,
    teamId,
    teamToken,
    outLinkUid,
    userBadFeedback,
    userGoodFeedback
  } = req.body as UpdateChatFeedbackProps;

  try {
    await connectToDatabase();

    await authChatCrud({
      req,
      authToken: true,
      authApiKey: true,
      appId,
      teamId,
      teamToken,
      chatId,
      shareId,
      outLinkUid,
      per: ReadPermissionVal
    });

    if (!dataId) {
      throw new Error('dataId is required');
    }

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

    jsonRes(res);
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}

export default NextAPI(handler);
