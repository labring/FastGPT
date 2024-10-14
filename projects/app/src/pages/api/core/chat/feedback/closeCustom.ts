import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import type { CloseCustomFeedbackParams } from '@/global/core/chat/api.d';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';

/* remove custom feedback */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    const { appId, chatId, dataId, index } = req.body as CloseCustomFeedbackParams;

    if (!dataId || !appId || !chatId) {
      throw new Error('missing parameter');
    }

    await authChatCrud({
      req,
      authToken: true,
      appId,
      chatId,
      per: ReadPermissionVal
    });
    await authCert({ req, authToken: true });

    await mongoSessionRun(async (session) => {
      await MongoChatItem.findOneAndUpdate(
        { appId, chatId, dataId },
        { $unset: { [`customFeedbacks.${index}`]: 1 } },
        {
          session
        }
      );
      await MongoChatItem.findOneAndUpdate(
        { appId, chatId, dataId },
        { $pull: { customFeedbacks: null } },
        {
          session
        }
      );
    });

    jsonRes(res);
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
