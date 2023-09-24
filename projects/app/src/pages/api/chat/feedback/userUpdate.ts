import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, ChatItem } from '@/service/mongo';

/* 初始化我的聊天框，需要身份验证 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    const { chatItemId, userFeedback = undefined } = req.body as {
      chatItemId: string;
      userFeedback?: string;
    };

    if (!chatItemId) {
      throw new Error('chatItemId is required');
    }

    await ChatItem.findOneAndUpdate(
      {
        dataId: chatItemId
      },
      {
        ...(userFeedback ? { userFeedback } : { $unset: { userFeedback: '' } })
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
