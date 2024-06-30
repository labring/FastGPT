import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { autChatCrud } from '@/service/support/permission/auth/chat';
import type { DeleteChatItemProps } from '@/global/core/chat/api.d';
import { NextAPI } from '@/service/middleware/entry';
import { ApiRequestProps } from '@fastgpt/service/type/next';

async function handler(req: ApiRequestProps<{}, DeleteChatItemProps>, res: NextApiResponse) {
  const { appId, chatId, contentId, shareId, outLinkUid } = req.query;

  if (!contentId || !chatId) {
    return jsonRes(res);
  }

  await autChatCrud({
    req,
    authToken: true,
    ...req.query,
    per: 'w'
  });

  await MongoChatItem.deleteOne({
    appId,
    chatId,
    dataId: contentId
  });

  jsonRes(res);
}

export default NextAPI(handler);
