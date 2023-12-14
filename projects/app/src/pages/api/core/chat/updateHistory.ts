import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { UpdateHistoryProps } from '@/global/core/chat/api.d';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { autChatCrud } from '@/service/support/permission/auth/chat';

/* update chat top, custom title */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    const { appId, chatId, shareId, outLinkUid, customTitle, top } = req.body as UpdateHistoryProps;

    await autChatCrud({
      req,
      authToken: true,
      appId,
      chatId,
      shareId,
      outLinkUid,
      per: 'w'
    });

    await MongoChat.findOneAndUpdate(
      { chatId },
      {
        ...(customTitle !== undefined && { customTitle }),
        ...(top !== undefined && { top })
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
