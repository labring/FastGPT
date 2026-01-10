import type { NextApiResponse } from 'next';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import type { DeleteChatItemProps } from '@/global/core/chat/api.d';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';

async function handler(req: ApiRequestProps<DeleteChatItemProps>, res: NextApiResponse) {
  const { appId, chatId, contentId } = req.body;

  if (!contentId || !chatId) {
    return Promise.reject('contentId or chatId is empty');
  }

  await authChatCrud({
    req,
    authToken: true,
    authApiKey: true,
    ...req.body
  });

  await MongoChatItem.updateOne(
    {
      appId,
      chatId,
      dataId: contentId
    },
    {
      $set: { deleteTime: new Date() }
    }
  );

  return;
}

export default NextAPI(handler);
