import type { NextApiResponse } from 'next';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { type DelHistoryProps } from '@/global/core/chat/api';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { MongoChatItemResponse } from '@fastgpt/service/core/chat/chatItemResponseSchema';
import { getS3ChatSource } from '@fastgpt/service/common/s3/sources/chat';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';

async function handler(req: ApiRequestProps<{}, DelHistoryProps>, res: NextApiResponse) {
  const { appId, chatId } = req.query;

  const [{ app }, { uid: uId }] = await Promise.all([
    authApp({
      req,
      authToken: true,
      authApiKey: true,
      appId,
      per: ReadPermissionVal
    }),
    authChatCrud({
      req,
      authToken: true,
      authApiKey: true,
      ...req.query
    })
  ]);

  if (!app.permission.hasReadChatLogPer && !app.permission.hasManagePer) {
    return Promise.reject(new Error('Only admin can permanently delete chat history'));
  }

  await mongoSessionRun(async (session) => {
    await Promise.all([
      MongoChatItemResponse.deleteMany({
        appId,
        chatId
      }),
      MongoChatItem.deleteMany(
        {
          appId,
          chatId
        },
        { session }
      ),
      MongoChat.deleteOne(
        {
          appId,
          chatId
        },
        { session }
      )
    ]);

    await getS3ChatSource().deleteChatFilesByPrefix({ appId, chatId, uId });
  });

  return;
}

export default NextAPI(handler);
