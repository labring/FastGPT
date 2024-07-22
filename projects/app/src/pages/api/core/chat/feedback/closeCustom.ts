import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import type { CloseCustomFeedbackParams } from '@/global/core/chat/api.d';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';

/* remove custom feedback */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    const { appId, chatId, chatItemId, index } = req.body as CloseCustomFeedbackParams;

    if (!chatItemId || !appId || !chatId || !chatItemId) {
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

    await MongoChatItem.findOneAndUpdate(
      { appId, chatId, dataId: chatItemId },
      { $unset: { [`customFeedbacks.${index}`]: 1 } }
    );

    jsonRes(res);
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
