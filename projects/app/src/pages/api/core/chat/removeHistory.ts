import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { authUser } from '@fastgpt/service/support/user/auth';
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
    const { userId } = await authUser({ req, authToken: true });

    if (chatId) {
      await Promise.all([
        MongoChat.findOneAndRemove({
          chatId,
          userId
        }),
        MongoChatItem.deleteMany({
          userId,
          chatId
        })
      ]);
    }
    if (appId) {
      const chats = await MongoChat.find({
        appId,
        userId,
        source: ChatSourceEnum.online
      }).select('_id');
      const chatIds = chats.map((chat) => chat._id);

      await Promise.all([
        MongoChat.deleteMany({
          _id: { $in: chatIds }
        }),
        MongoChatItem.deleteMany({
          chatId: { $in: chatIds }
        })
      ]);
    }

    jsonRes(res);
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
