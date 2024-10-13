import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { UpdateChatFeedbackProps } from '@fastgpt/global/core/chat/api';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { authAppApikey } from '@fastgpt/service/support/permission/app/auth';

/* 初始化我的聊天框，需要身份验证 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const {
    chatId,
    chatItemId,
    shareId,
    teamId,
    teamToken,
    outLinkUid,
    userBadFeedback,
    userGoodFeedback
  } = req.body as UpdateChatFeedbackProps;
  let appId = req.body.appId;

  try {
    await connectToDatabase();

    if (appId) {
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
    } else {
      const { appId: apiKeyAppId } = await authAppApikey({ req });
      appId = apiKeyAppId!;
    }

    if (!chatItemId) {
      throw new Error('chatItemId is required');
    }

    await MongoChatItem.findOneAndUpdate(
      {
        appId,
        chatId,
        dataId: chatItemId
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
