import type { NextApiResponse } from 'next';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { type DelHistoryProps } from '@/global/core/chat/api';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';

/* clear chat history */
async function handler(req: ApiRequestProps<{}, DelHistoryProps>, res: NextApiResponse) {
  const { appId, chatId } = req.query;

  await authChatCrud({
    req,
    authToken: true,
    authApiKey: true,
    ...req.query
  });

  await mongoSessionRun(async (session) => {
    await MongoChat.updateOne(
      {
        appId,
        chatId,
        deleteTime: null
      },
      {
        $set: {
          deleteTime: new Date()
        }
      },
      { session }
    );
  });

  return;
}

export default NextAPI(handler);
