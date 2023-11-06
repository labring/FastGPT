import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';

type Props = {
  chatId?: string;
  appId?: string;
};

/* clear chat history */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    const { chatId, appId } = req.query as Props;

    const { tmbId } = await authCert({ req, authToken: true });

    if (chatId) {
      await MongoChatItem.deleteMany({
        chatId,
        tmbId
      });
      await MongoChat.findOneAndRemove({
        chatId,
        tmbId
      });
    }
    if (appId) {
      const chats = await MongoChat.find({
        appId,
        tmbId,
        source: ChatSourceEnum.online
      }).select('_id');
      const chatIds = chats.map((chat) => chat._id);
      await MongoChatItem.deleteMany({
        chatId: { $in: chatIds }
      });
      await MongoChat.deleteMany({
        _id: { $in: chatIds }
      });
    }

    jsonRes(res);
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
