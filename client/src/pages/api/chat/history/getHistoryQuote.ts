import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, Chat } from '@/service/mongo';
import { authUser } from '@/service/utils/auth';
import { Types } from 'mongoose';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { chatId, historyId } = req.query as {
      chatId: string;
      historyId: string;
    };
    await connectToDatabase();

    const { userId } = await authUser({ req, authToken: true });

    if (!chatId || !historyId) {
      throw new Error('params is error');
    }

    const history = await Chat.aggregate([
      {
        $match: {
          _id: new Types.ObjectId(chatId),
          userId: new Types.ObjectId(userId)
        }
      },
      {
        $unwind: '$content'
      },
      {
        $match: {
          'content._id': new Types.ObjectId(historyId)
        }
      },
      {
        $project: {
          quote: '$content.quote'
        }
      }
    ]);

    jsonRes(res, {
      data: history[0]?.quote || []
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
