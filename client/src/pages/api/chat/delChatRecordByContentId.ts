import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, Chat } from '@/service/mongo';
import { authUser } from '@/service/utils/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { chatId, contentId } = req.query as {
      chatId: string;
      contentId: string;
    };

    if (!chatId || !contentId) {
      throw new Error('缺少参数');
    }

    await connectToDatabase();

    // 凭证校验
    const { userId } = await authUser({ req, authToken: true });

    const chatRecord = await Chat.findById(chatId);

    if (!chatRecord) {
      throw new Error('找不到对话');
    }

    // 删除一条数据库记录
    await Chat.updateOne(
      {
        _id: chatId,
        userId
      },
      { $pull: { content: { _id: contentId } } }
    );

    jsonRes(res);
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
