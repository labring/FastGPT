import type { NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { type DelHistoryProps } from '@/global/core/chat/api';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';

/* 逻辑删除会话历史 */
async function handler(req: ApiRequestProps<{}, DelHistoryProps>, res: NextApiResponse) {
  const { appId, chatId } = req.query;

  const { tmbId } = await authChatCrud({
    req,
    authToken: true,
    authApiKey: true,
    ...req.query
  });

  // 逻辑删除：不删除文件，保留供管理员查看
  const now = new Date();

  await mongoSessionRun(async (session) => {
    // 标记所有 chatitems 为已删除
    await MongoChatItem.updateMany(
      {
        appId,
        chatId
      },
      {
        $set: {
          deleted: true,
          deletedAt: now,
          deletedBy: tmbId
        }
      },
      { session }
    );
    // 标记 chat 为已删除
    await MongoChat.updateOne(
      {
        appId,
        chatId
      },
      {
        $set: {
          deleted: true,
          deletedAt: now,
          deletedBy: tmbId
        }
      },
      { session }
    );
  });

  jsonRes(res);
}

export default NextAPI(handler);
