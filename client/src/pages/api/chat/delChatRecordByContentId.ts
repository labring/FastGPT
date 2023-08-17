import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, ChatItem } from '@/service/mongo';
import { authUser } from '@/service/utils/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { chatId, contentId } = req.query as { chatId: string; contentId: string };

    await connectToDatabase();

    // 凭证校验
    const { userId } = await authUser({ req, authToken: true });

    // 删除一条数据库记录
    await ChatItem.deleteOne({
      dataId: contentId,
      chatId,
      userId
    });

    jsonRes(res);
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
