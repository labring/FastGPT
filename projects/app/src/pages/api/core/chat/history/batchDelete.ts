import type { NextApiResponse } from 'next';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { MongoChatItemResponse } from '@fastgpt/service/core/chat/chatItemResponseSchema';
import { getS3ChatSource } from '@fastgpt/service/common/s3/sources/chat';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { AppReadChatLogPerVal } from '@fastgpt/global/support/permission/app/constant';
import { ChatBatchDeleteBodySchema } from '@fastgpt/global/openapi/core/chat/history/api';

async function handler(req: ApiRequestProps, res: NextApiResponse) {
  const { appId, chatIds } = ChatBatchDeleteBodySchema.parse(req.body);

  if (!Array.isArray(chatIds) || chatIds.length === 0) {
    return Promise.reject(new Error('chatIds is required and must be an array'));
  }

  await authApp({
    req,
    authToken: true,
    authApiKey: true,
    appId,
    per: AppReadChatLogPerVal
  });

  await mongoSessionRun(async (session) => {
    const chatList = await MongoChat.find(
      {
        appId,
        chatId: { $in: chatIds }
      },
      'chatId tmbId outLinkUid'
    )
      .lean()
      .session(session);

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
      chatList.map((item) => {
        return getS3ChatSource().deleteChatFilesByPrefix({
          appId,
          chatId: item.chatId,
          uId: String(item.outLinkUid || item.tmbId)
        });
      })
    );
  });

  return;
}

export default NextAPI(handler);
