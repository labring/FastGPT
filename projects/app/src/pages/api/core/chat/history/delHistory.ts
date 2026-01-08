import type { NextApiResponse } from 'next';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { DelChatHistorySchema } from '@fastgpt/global/openapi/core/chat/history/api';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';

/* delete single chat history (soft delete) */
export async function handler(req: ApiRequestProps, res: NextApiResponse) {
  const { appId, chatId } = DelChatHistorySchema.parse(req.query);

  await authChatCrud({
    req,
    authToken: true,
    authApiKey: true,
    ...req.query
  });

  await MongoChat.updateOne(
    {
      appId,
      chatId
    },
    {
      $set: {
        deleteTime: new Date()
      }
    }
  );

  return;
}

export default NextAPI(handler);
