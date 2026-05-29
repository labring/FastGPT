import type { NextApiResponse } from 'next';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { DelChatHistorySchema } from '@fastgpt/global/openapi/core/chat/history/api';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

/* delete single chat history (soft delete) */
export async function handler(req: ApiRequestProps, res: NextApiResponse) {
  const { appId, chatId } = parseApiInput({ req, querySchema: DelChatHistorySchema }).query;

  await authChatCrud({
    ...req.query,
    req,
    authToken: true,
    authApiKey: true
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
