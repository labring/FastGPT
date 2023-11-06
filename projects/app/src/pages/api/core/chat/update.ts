import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { UpdateHistoryProps } from '@fastgpt/global/core/chat/api.d';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { authChat } from '@fastgpt/service/support/permission/auth/chat';

/* 更新聊天标题 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    const { chatId, customTitle, top } = req.body as UpdateHistoryProps;

    await authChat({ req, authToken: true, chatId });

    await MongoChat.findByIdAndUpdate(chatId, {
      ...(customTitle ? { customTitle } : {}),
      ...(top ? { top } : { top: null })
    });
    jsonRes(res);
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
