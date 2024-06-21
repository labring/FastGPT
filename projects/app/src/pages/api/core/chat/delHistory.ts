import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { DelHistoryProps } from '@/global/core/chat/api';
import { autChatCrud } from '@/service/support/permission/auth/chat';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { NextAPI } from '@/service/middleware/entry';
import { ApiRequestProps } from '@fastgpt/service/type/next';

/* clear chat history */
async function handler(req: ApiRequestProps<{}, DelHistoryProps>, res: NextApiResponse) {
  const { appId, chatId } = req.query;

  await autChatCrud({
    req,
    authToken: true,
    ...req.query,
    per: 'w'
  });

  await mongoSessionRun(async (session) => {
    await MongoChatItem.deleteMany(
      {
        appId,
        chatId
      },
      { session }
    );
    await MongoChat.findOneAndRemove(
      {
        appId,
        chatId
      },
      { session }
    );
  });

  jsonRes(res);
}

export default NextAPI(handler);
