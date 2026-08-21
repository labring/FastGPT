import type { NextApiResponse } from 'next';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { DelChatHistorySchema } from '@fastgpt/global/openapi/core/chat/history/api';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/next/type';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import { buildChatHistoryMatch } from '@/service/core/chat/history';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { ReadPermissionVal, WritePermissionVal } from '@fastgpt/global/support/permission/constant';

/* delete single chat history (soft delete) */
export async function handler(req: ApiRequestProps, _res: NextApiResponse) {
  const { query } = parseApiInput({ req, querySchema: DelChatHistorySchema });
  const { sourceType, sourceId, chatId, outLinkAuthData } = query;

  const per = sourceType === ChatSourceTypeEnum.skillEdit ? WritePermissionVal : ReadPermissionVal;
  const match = await buildChatHistoryMatch({
    req,
    sourceType,
    sourceId,
    chatId,
    outLinkAuthData,
    per
  });
  if (!match) return Promise.reject(ChatErrEnum.unAuthChat);

  await MongoChat.updateOne(
    {
      ...match,
      chatId
    },
    {
      $set: {
        deleteTime: new Date()
      }
    }
  );

  return;
}

export default NextAPI(handler);
