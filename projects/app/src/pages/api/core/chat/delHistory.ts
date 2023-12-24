import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { DelHistoryProps } from '@/global/core/chat/api';
import { autChatCrud } from '@/service/support/permission/auth/chat';

/* clear chat history */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    const { appId, chatId, shareId, outLinkUid } = req.query as DelHistoryProps;

    await autChatCrud({
      req,
      authToken: true,
      appId,
      chatId,
      shareId,
      outLinkUid,
      per: 'w'
    });

    await MongoChatItem.deleteMany({
      chatId
    });
    await MongoChat.findOneAndRemove({
      chatId
    });

    jsonRes(res);
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
