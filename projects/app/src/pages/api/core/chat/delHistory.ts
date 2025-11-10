import type { NextApiResponse } from 'next';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { type DelHistoryProps } from '@/global/core/chat/api';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { deleteChatFiles } from '@fastgpt/service/core/chat/controller';
import { MongoChatItemResponse } from '@fastgpt/service/core/chat/chatItemResponseSchema';
import { getS3ChatSource } from '@fastgpt/service/common/s3/sources/chat';

/* clear chat history */
async function handler(req: ApiRequestProps<{}, DelHistoryProps>, res: NextApiResponse) {
  const { appId, chatId } = req.query;

  const { uid: uId } = await authChatCrud({
    req,
    authToken: true,
    authApiKey: true,
    ...req.query
  });

  await deleteChatFiles({ chatIdList: [chatId] });
  await mongoSessionRun(async (session) => {
    await MongoChatItemResponse.deleteMany({
      appId,
      chatId
    });
    await MongoChatItem.deleteMany(
      {
        appId,
        chatId
      },
      { session }
    );
    await MongoChat.deleteOne(
      {
        appId,
        chatId
      },
      { session }
    );
    await getS3ChatSource().deleteChatFilesByPrefix({ appId, chatId, uId });
  });

  return;
}

export default NextAPI(handler);
