import type { NextApiResponse } from 'next';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import type { DeleteChatItemProps } from '@/global/core/chat/api.d';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoChatItemResponse } from '@fastgpt/service/core/chat/chatItemResponseSchema';

async function handler(req: ApiRequestProps<{}, DeleteChatItemProps>, res: NextApiResponse) {
  const { appId, chatId, contentId } = req.query;

  if (!contentId || !chatId) {
    return Promise.reject('contentId or chatId is empty');
  }

  await authChatCrud({
    req,
    authToken: true,
    authApiKey: true,
    ...req.query
  });

  await mongoSessionRun(async (session) => {
    await MongoChatItemResponse.deleteMany({
      appId,
      chatId,
      chatItemDataId: contentId
    }).session(session);
    await MongoChatItem.deleteOne({
      appId,
      chatId,
      dataId: contentId
    }).session(session);
  });

  return;
}

export default NextAPI(handler);
