import type { NextApiResponse } from 'next';
import { UpdateHistoryBodySchema } from '@fastgpt/global/openapi/core/chat/history/api';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/next/type';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import { buildChatHistoryMatch } from '@/service/core/chat/history';

/* update chat history: title, customTitle, top */
export async function handler(req: ApiRequestProps, _res: NextApiResponse) {
  const { sourceType, sourceId, chatId, title, customTitle, top, outLinkAuthData } = parseApiInput({
    req,
    bodySchema: UpdateHistoryBodySchema
  }).body;

  const match = await buildChatHistoryMatch({
    req,
    sourceType,
    sourceId,
    chatId,
    outLinkAuthData,
    per: WritePermissionVal
  });
  if (!match) return Promise.reject(ChatErrEnum.unAuthChat);

  await MongoChat.updateOne(
    { ...match, chatId },
    {
      updateTime: new Date(),
      ...(title !== undefined && { title }),
      ...(customTitle !== undefined && { customTitle }),
      ...(top !== undefined && { top })
    }
  );
}

export default NextAPI(handler);
