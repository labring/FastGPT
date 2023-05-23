import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { Chat } from '@/service/mongo';
import { authUser } from '@/service/utils/auth';
import { QuoteItemType } from '../kb/appKbSearch';

type Props = {
  chatId: string;
};
export type Response = {
  quote: QuoteItemType[];
};

/* 聊天内容存存储 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { chatId } = req.query as Props;

    if (!chatId) {
      throw new Error('缺少参数');
    }

    const { userId } = await authUser({ req });

    const chatItem = await Chat.findOne({ _id: chatId, userId }, { content: { $slice: -1 } });

    jsonRes<Response>(res, {
      data: {
        quote: chatItem?.content[0]?.quote || []
      }
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
