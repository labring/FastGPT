import type { NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import type { DeleteChatItemProps } from '@/global/core/chat/api.d';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';

/* 逻辑删除单条对话消息 */
async function handler(req: ApiRequestProps<{}, DeleteChatItemProps>, res: NextApiResponse) {
  const { appId, chatId, contentId } = req.query;

  if (!contentId || !chatId) {
    return Promise.reject('contentId or chatId is empty');
  }

  const { tmbId } = await authChatCrud({
    req,
    authToken: true,
    authApiKey: true,
    ...req.query
  });

  // 逻辑删除：标记为已删除而非物理删除
  await MongoChatItem.updateOne(
    {
      appId,
      chatId,
      dataId: contentId
    },
    {
      $set: {
        deleted: true,
        deletedAt: new Date(),
        deletedBy: tmbId
      }
    }
  );

  return;
}

export default NextAPI(handler);
