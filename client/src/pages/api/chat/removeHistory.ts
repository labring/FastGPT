import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, Chat, ChatItem } from '@/service/mongo';
import { authUser } from '@/service/utils/auth';
import { ChatSourceEnum } from '@/constants/chat';

type Props = {
  chatId?: string;
  appId?: string;
};

/* clear chat history */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { chatId, appId } = req.query as Props;
    const { userId } = await authUser({ req, authToken: true });

    await connectToDatabase();

    if (chatId) {
      await Promise.all([
        Chat.findOneAndRemove({
          chatId,
          userId
        }),
        ChatItem.deleteMany({
          userId,
          chatId
        })
      ]);
    }
    if (appId) {
      const chats = await Chat.find({
        appId,
        userId,
        source: ChatSourceEnum.online
      }).select('_id');
      const chatIds = chats.map((chat) => chat._id);

      await Promise.all([
        Chat.deleteMany({
          _id: { $in: chatIds }
        }),
        ChatItem.deleteMany({
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
