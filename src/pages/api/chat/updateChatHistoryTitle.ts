import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, Chat } from '@/service/mongo';
import { authModel } from '@/service/utils/auth';
import { authUser } from '@/service/utils/auth';

/* 更新聊天标题 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { chatId, modelId, newTitle } = req.body as {
      chatId: '' | string;
      modelId: '' | string;
      newTitle: string;
    };

    const { userId } = await authUser({ req, authToken: true });

    await connectToDatabase();

    await authModel({ modelId, userId, authOwner: false });

    await Chat.findByIdAndUpdate(
      chatId,
      {
        title: newTitle,
        customTitle: true
      } // 自定义标题}
    );
    jsonRes(res);
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
