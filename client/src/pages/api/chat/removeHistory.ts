import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, Chat } from '@/service/mongo';
import { authUser } from '@/service/utils/auth';

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
      await Chat.findOneAndRemove({
        chatId,
        userId
      });
    }
    if (appId) {
      await Chat.deleteMany({
        appId,
        userId
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
