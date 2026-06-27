import type { NextApiResponse } from 'next';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { ClearChatHistoriesSchema } from '@fastgpt/global/openapi/core/chat/history/api';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import { buildClearChatHistoriesMatch } from '@/service/core/chat/history';

/* clear all chat histories of an app */
export async function handler(req: ApiRequestProps, res: NextApiResponse) {
  const { query } = parseApiInput({ req, querySchema: ClearChatHistoriesSchema });
  const { sourceType, sourceId, outLinkAuthData } = query;

  const match = await buildClearChatHistoriesMatch({
    req,
    sourceType,
    sourceId,
    outLinkAuthData
  });
  if (!match) return Promise.reject(ChatErrEnum.unAuthChat);

  // find chatIds
  const list = await MongoChat.find(match, 'chatId').lean();

  await MongoChat.updateMany(
    {
      ...match,
      chatId: { $in: list.map((item) => item.chatId) }
    },
    {
      $set: {
        deleteTime: new Date()
      }
    }
  );
}

export default NextAPI(handler);
