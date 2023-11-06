import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { authUser } from '@fastgpt/service/support/user/auth';
import { UpdateHistoryProps } from '@fastgpt/global/core/chat/api.d';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';

/* 更新聊天标题 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    const { chatId, customTitle, top } = req.body as UpdateHistoryProps;

    const { userId } = await authUser({ req, authToken: true });

    await MongoChat.findOneAndUpdate(
      {
        chatId,
        userId
      },
      {
        ...(customTitle ? { customTitle } : {}),
        ...(top ? { top } : { top: null })
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
