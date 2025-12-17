import type { NextApiResponse } from 'next';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { MongoChatItemResponse } from '@fastgpt/service/core/chat/chatItemResponseSchema';
import { getS3ChatSource } from '@fastgpt/service/common/s3/sources/chat';
import { authBatchChatCrud } from '@/service/support/permission/auth/chat';

type BatchDeleteRequest = {
  appId: string;
  chatIds: string[];
};

async function handler(req: ApiRequestProps<BatchDeleteRequest, {}>, res: NextApiResponse) {
  const { appId, chatIds } = req.body;

  if (!Array.isArray(chatIds) || chatIds.length === 0) {
    return Promise.reject(new Error('chatIds is required and must be an array'));
  }

  await authBatchChatCrud({
    req,
    authToken: true,
    authApiKey: true,
    appId,
    chatIds
  });

  await mongoSessionRun(async (session) => {
    const chats = await MongoChat.find(
      {
        appId,
        chatId: { $in: chatIds }
      },
      null,
      { session }
    ).lean();
    if (chats.length === 0) {
      return;
    }
    await MongoChatItemResponse.deleteMany({
      appId,
      chatId: { $in: chatIds }
    });
    await MongoChatItem.deleteMany(
      {
        appId,
        chatId: { $in: chatIds }
      },
      { session }
    );
    await MongoChat.deleteMany(
      {
        appId,
        chatId: { $in: chatIds }
      },
      { session }
    );
    await Promise.all(
      chats.map((chat) =>
        getS3ChatSource().deleteChatFilesByPrefix({
          appId,
          chatId: chat.chatId,
          uId: chat.userId
        })
      )
    );
  });

  return { deletedCount: chatIds.length };
}

export default NextAPI(handler);
