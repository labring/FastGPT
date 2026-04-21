import type { NextApiResponse } from 'next';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import {
  DeleteChatRecordBodySchema,
  DeleteChatRecordResponseSchema,
  type DeleteChatRecordResponseType
} from '@fastgpt/global/openapi/core/chat/record/api';

async function handler(
  req: ApiRequestProps,
  _res: NextApiResponse
): Promise<DeleteChatRecordResponseType> {
  const { appId, chatId, contentId, delFile, ...authProps } = DeleteChatRecordBodySchema.parse(
    req.query
  );
  await authChatCrud({
    req,
    authToken: true,
    authApiKey: true,
    appId,
    chatId,
    ...authProps
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

  return DeleteChatRecordResponseSchema.parse({});
}

export default NextAPI(handler);
